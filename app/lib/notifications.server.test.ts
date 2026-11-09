import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import {
  approveRefundRequest,
  declineRefundRequest,
  raiseRefundRequest,
} from "./refunds.server";
import { notifyRefundRequestDecided } from "./notifications.server";
import type { Notifier } from "./notifier.server";
import { fakeNotifier } from "~/test/fake-notifier";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let platformAdmin: typeof schema.users.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  platformAdmin = db
    .insert(schema.users)
    .values({ name: "Pat Admin", email: "pat@example.com", role: UserRole.Admin })
    .returning()
    .get();
});

function buyForSelf(userId: number) {
  const purchase = db
    .insert(schema.purchases)
    .values({
      userId,
      courseId: base.course.id,
      amountPaid: 7900,
      createdAt: NOW.toISOString(),
    })
    .returning()
    .get();
  db.insert(schema.enrollments)
    .values({ userId, courseId: base.course.id })
    .run();
  return purchase;
}

function buySeats(userId: number, seats: number) {
  const team = db.insert(schema.teams).values({}).returning().get();
  const purchase = db
    .insert(schema.purchases)
    .values({
      userId,
      courseId: base.course.id,
      amountPaid: 7900 * seats,
      createdAt: NOW.toISOString(),
    })
    .returning()
    .get();
  for (let i = 0; i < seats; i++) {
    db.insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: base.course.id,
        code: `SEAT-${purchase.id}-${i}`,
        purchaseId: purchase.id,
      })
      .run();
  }
  return purchase;
}

function raise(purchaseId: number, buyerId: number) {
  const raised = raiseRefundRequest(db, purchaseId, buyerId, "Not for me", NOW);
  if (!raised.ok) throw new Error(raised.error);
  return raised.refundRequestId;
}

function approve(refundRequestId: number, deciderId: number, note: string | null) {
  const decided = approveRefundRequest(db, refundRequestId, deciderId, note, NOW);
  if (!decided.ok) throw new Error(decided.error);
}

function decline(refundRequestId: number, deciderId: number, note: string) {
  const decided = declineRefundRequest(db, refundRequestId, deciderId, note, NOW);
  if (!decided.ok) throw new Error(decided.error);
}

describe("notifyRefundRequestDecided", () => {
  it("tells the buyer of an Individual Purchase their Refund Request was approved", async () => {
    const purchase = buyForSelf(base.user.id);
    const refundRequestId = raise(purchase.id, base.user.id);
    approve(refundRequestId, platformAdmin.id, "Sorry it didn't work out.");
    const notifier = fakeNotifier();

    await notifyRefundRequestDecided(db, notifier, refundRequestId);

    expect(notifier.triggers).toEqual([
      {
        workflow: "refund-request-approved",
        recipients: [
          { id: String(base.user.id), name: "Test User", email: "test@example.com" },
        ],
        data: {
          kind: "refund_request_approved",
          course_title: "Test Course",
          note: "Sorry it didn't work out.",
          url: "/settings",
        },
        idempotencyKey: `refund:${refundRequestId}:approved`,
      },
    ]);
  });

  it("tells the buyer their Refund Request was declined, with the decision note", async () => {
    const purchase = buyForSelf(base.user.id);
    const refundRequestId = raise(purchase.id, base.user.id);
    decline(refundRequestId, platformAdmin.id, "You have watched most of it.");
    const notifier = fakeNotifier();

    await notifyRefundRequestDecided(db, notifier, refundRequestId);

    expect(notifier.triggers).toEqual([
      {
        workflow: "refund-request-declined",
        recipients: [
          { id: String(base.user.id), name: "Test User", email: "test@example.com" },
        ],
        data: {
          kind: "refund_request_declined",
          course_title: "Test Course",
          note: "You have watched most of it.",
          url: "/settings",
        },
        idempotencyKey: `refund:${refundRequestId}:declined`,
      },
    ]);
  });

  it("leaves the note out when the approval has none", async () => {
    const purchase = buyForSelf(base.user.id);
    const refundRequestId = raise(purchase.id, base.user.id);
    approve(refundRequestId, platformAdmin.id, null);
    const notifier = fakeNotifier();

    await notifyRefundRequestDecided(db, notifier, refundRequestId);

    expect(notifier.triggers[0]?.data).toEqual({
      kind: "refund_request_approved",
      course_title: "Test Course",
      url: "/settings",
    });
  });

  it("tells a Team Licence's buyer, linking to their team page", async () => {
    const teamAdmin = db
      .insert(schema.users)
      .values({ name: "Tara Team", email: "tara@example.com", role: UserRole.Student })
      .returning()
      .get();
    const purchase = buySeats(teamAdmin.id, 3);
    const refundRequestId = raise(purchase.id, teamAdmin.id);
    approve(refundRequestId, platformAdmin.id, null);
    const notifier = fakeNotifier();

    await notifyRefundRequestDecided(db, notifier, refundRequestId);

    expect(notifier.triggers).toMatchObject([
      {
        recipients: [
          { id: String(teamAdmin.id), name: "Tara Team", email: "tara@example.com" },
        ],
        data: { url: "/team" },
      },
    ]);
  });

  it("doesn't tell a Platform Admin about deciding their own Refund Request", async () => {
    const purchase = buyForSelf(platformAdmin.id);
    const refundRequestId = raise(purchase.id, platformAdmin.id);
    approve(refundRequestId, platformAdmin.id, null);
    const notifier = fakeNotifier();

    await notifyRefundRequestDecided(db, notifier, refundRequestId);

    expect(notifier.triggers).toEqual([]);
  });

  it("logs a Notifier failure instead of throwing it", async () => {
    const purchase = buyForSelf(base.user.id);
    const refundRequestId = raise(purchase.id, base.user.id);
    approve(refundRequestId, platformAdmin.id, null);
    const failure = new Error("Knock is down");
    const failing: Notifier = {
      async trigger() {
        throw failure;
      },
    };
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      notifyRefundRequestDecided(db, failing, refundRequestId)
    ).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalledWith(expect.any(String), failure);
    logged.mockRestore();
  });
});
