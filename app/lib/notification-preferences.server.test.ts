import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import {
  listNotificationPreferences,
  setNotificationPreference,
} from "./notifications.server";
import { fakeNotifier } from "~/test/fake-notifier";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

function buyForSelf(userId: number) {
  return db
    .insert(schema.purchases)
    .values({ userId, courseId: base.course.id, amountPaid: 7900 })
    .returning()
    .get();
}

function buySeats(userId: number, seats: number) {
  const team = db.insert(schema.teams).values({}).returning().get();
  const purchase = buyForSelf(userId);
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

describe("listNotificationPreferences", () => {
  it("shows a Student the three rows everyone gets, all on by default", async () => {
    const rows = await listNotificationPreferences(db, fakeNotifier(), base.user.id);

    expect(rows).toEqual([
      { workflow: "refund-request-approved", label: "Refund Request approved", notifyMe: true, email: true },
      { workflow: "refund-request-declined", label: "Refund Request declined", notifyMe: true, email: true },
      { workflow: "discussion-reply-posted", label: "Discussion Reply", notifyMe: true, email: true },
    ]);
  });

  it("adds Seat claimed, with email off by default, for someone who owns a Team Licence", async () => {
    buySeats(base.user.id, 3);

    const rows = await listNotificationPreferences(db, fakeNotifier(), base.user.id);

    expect(rows.map((row) => row.workflow)).toEqual([
      "refund-request-approved",
      "refund-request-declined",
      "discussion-reply-posted",
      "seat-claimed",
    ]);
    expect(rows[3]).toEqual({
      workflow: "seat-claimed",
      label: "Seat claimed",
      notifyMe: true,
      email: false,
    });
  });

  it("doesn't count an Individual Purchase as owning a Team Licence", async () => {
    buyForSelf(base.user.id);

    const rows = await listNotificationPreferences(db, fakeNotifier(), base.user.id);

    expect(rows.map((row) => row.workflow)).not.toContain("seat-claimed");
  });

  it("adds New Enrollment, off by default, and New Discussion Question for an Instructor", async () => {
    const rows = await listNotificationPreferences(db, fakeNotifier(), base.instructor.id);

    expect(rows.slice(3)).toEqual([
      { workflow: "enrollment-created", label: "New Enrollment", notifyMe: false, email: false },
      { workflow: "discussion-question-posted", label: "New Discussion Question", notifyMe: true, email: true },
    ]);
  });

  it("adds New Open Refund Request, on by default, for a Platform Admin", async () => {
    const admin = db
      .insert(schema.users)
      .values({ name: "Pat Admin", email: "pat@example.com", role: UserRole.Admin })
      .returning()
      .get();

    const rows = await listNotificationPreferences(db, fakeNotifier(), admin.id);

    expect(rows.slice(3)).toEqual([
      { workflow: "refund-request-opened", label: "New Open Refund Request", notifyMe: true, email: true },
    ]);
  });

  it("shows what is stored over the defaults, and the default for whatever isn't", async () => {
    const notifier = fakeNotifier();
    notifier.preferences.set(String(base.instructor.id), {
      "enrollment-created": { in_app_feed: true },
      "discussion-reply-posted": { in_app_feed: true, email: false },
    });

    const rows = await listNotificationPreferences(db, notifier, base.instructor.id);

    expect(rows.find((row) => row.workflow === "enrollment-created")).toMatchObject({
      notifyMe: true,
      email: false,
    });
    expect(rows.find((row) => row.workflow === "discussion-reply-posted")).toMatchObject({
      notifyMe: true,
      email: false,
    });
    expect(rows.find((row) => row.workflow === "refund-request-approved")).toMatchObject({
      notifyMe: true,
      email: true,
    });
  });

  it("shows email off for a Notification that is off, whatever email says", async () => {
    const notifier = fakeNotifier();
    notifier.preferences.set(String(base.user.id), {
      "discussion-reply-posted": { in_app_feed: false, email: true },
    });

    const rows = await listNotificationPreferences(db, notifier, base.user.id);

    expect(rows.find((row) => row.workflow === "discussion-reply-posted")).toMatchObject({
      notifyMe: false,
      email: false,
    });
  });
});

describe("setNotificationPreference", () => {
  it("stores a Notification's Feed and email Channels", async () => {
    const notifier = fakeNotifier();

    await setNotificationPreference(db, notifier, base.user.id, "discussion-reply-posted", {
      notifyMe: true,
      email: false,
    });

    expect(notifier.preferences.get(String(base.user.id))).toEqual({
      "discussion-reply-posted": { in_app_feed: true, email: false },
    });
    const rows = await listNotificationPreferences(db, notifier, base.user.id);
    expect(rows.find((row) => row.workflow === "discussion-reply-posted")).toMatchObject({
      notifyMe: true,
      email: false,
    });
  });

  it("turns both Channels off when Notify me is turned off, never storing Feed off with email on", async () => {
    const notifier = fakeNotifier();

    await setNotificationPreference(db, notifier, base.user.id, "refund-request-approved", {
      notifyMe: false,
      email: true,
    });

    expect(notifier.preferences.get(String(base.user.id))).toEqual({
      "refund-request-approved": { in_app_feed: false, email: false },
    });
  });

  it("leaves every other Notification as it is", async () => {
    const notifier = fakeNotifier();
    await setNotificationPreference(db, notifier, base.user.id, "refund-request-approved", {
      notifyMe: false,
      email: false,
    });

    await setNotificationPreference(db, notifier, base.user.id, "refund-request-declined", {
      notifyMe: true,
      email: false,
    });

    expect(notifier.preferences.get(String(base.user.id))).toEqual({
      "refund-request-approved": { in_app_feed: false, email: false },
      "refund-request-declined": { in_app_feed: true, email: false },
    });
  });

  it("refuses a Notification the person can't get, and stores nothing", async () => {
    const notifier = fakeNotifier();

    await expect(
      setNotificationPreference(db, notifier, base.user.id, "refund-request-opened", {
        notifyMe: false,
        email: false,
      })
    ).rejects.toThrow();
    await expect(
      setNotificationPreference(db, notifier, base.user.id, "no-such-workflow", {
        notifyMe: false,
        email: false,
      })
    ).rejects.toThrow();

    expect(notifier.preferences.size).toBe(0);
  });
});
