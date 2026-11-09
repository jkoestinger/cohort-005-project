import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import {
  approveRefundRequest,
  declineRefundRequest,
  raiseRefundRequest,
} from "./refunds.server";
import {
  archiveCommentNotifications,
  notifyCommentPosted,
  notifyEnrollmentCreated,
  notifyRefundRequestDecided,
  notifyRefundRequestRaised,
  notifySeatClaimed,
} from "./notifications.server";
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
      ...fakeNotifier(),
      async trigger() {
        throw failure;
      },
      async archiveByCommentId() {
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

describe("notifyRefundRequestRaised", () => {
  it("tells every Platform Admin about a new Open Refund Request", async () => {
    const secondAdmin = db
      .insert(schema.users)
      .values({ name: "Sam Admin", email: "sam@example.com", role: UserRole.Admin })
      .returning()
      .get();
    const purchase = buyForSelf(base.user.id);
    const refundRequestId = raise(purchase.id, base.user.id);
    const notifier = fakeNotifier();

    await notifyRefundRequestRaised(db, notifier, refundRequestId);

    expect(notifier.triggers).toEqual([
      {
        workflow: "refund-request-opened",
        recipients: expect.arrayContaining([
          { id: String(platformAdmin.id), name: "Pat Admin", email: "pat@example.com" },
          { id: String(secondAdmin.id), name: "Sam Admin", email: "sam@example.com" },
        ]),
        data: {
          kind: "refund_request_opened",
          actor_name: "Test User",
          course_title: "Test Course",
          amount: "$79.00",
          reason: "Not for me",
          url: "/admin/refunds",
        },
        idempotencyKey: `refund:${refundRequestId}:opened`,
      },
    ]);
    expect(notifier.triggers[0]?.recipients).toHaveLength(2);
  });

  it("leaves out a Platform Admin who raised it on their own Purchase", async () => {
    const otherAdmin = db
      .insert(schema.users)
      .values({ name: "Sam Admin", email: "sam@example.com", role: UserRole.Admin })
      .returning()
      .get();
    const purchase = buyForSelf(platformAdmin.id);
    const refundRequestId = raise(purchase.id, platformAdmin.id);
    const notifier = fakeNotifier();

    await notifyRefundRequestRaised(db, notifier, refundRequestId);

    expect(notifier.triggers).toMatchObject([
      {
        recipients: [
          { id: String(otherAdmin.id), name: "Sam Admin", email: "sam@example.com" },
        ],
        data: { actor_name: "Pat Admin" },
      },
    ]);
  });

  it("triggers nothing when the buyer is the only Platform Admin", async () => {
    const purchase = buyForSelf(platformAdmin.id);
    const refundRequestId = raise(purchase.id, platformAdmin.id);
    const notifier = fakeNotifier();

    await notifyRefundRequestRaised(db, notifier, refundRequestId);

    expect(notifier.triggers).toEqual([]);
  });

  it("includes a user promoted to admin since the last Notification", async () => {
    const notifier = fakeNotifier();
    const first = raise(buyForSelf(base.user.id).id, base.user.id);
    await notifyRefundRequestRaised(db, notifier, first);
    approve(first, platformAdmin.id, null);

    db.update(schema.users)
      .set({ role: UserRole.Admin })
      .where(eq(schema.users.id, base.instructor.id))
      .run();
    const second = raise(buyForSelf(base.user.id).id, base.user.id);
    await notifyRefundRequestRaised(db, notifier, second);

    expect(notifier.triggers[1]?.recipients).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: String(base.instructor.id) }),
      ])
    );
    expect(notifier.triggers[1]?.recipients).toHaveLength(2);
  });

  it("logs a Notifier failure instead of throwing it", async () => {
    const refundRequestId = raise(buyForSelf(base.user.id).id, base.user.id);
    const failure = new Error("Knock is down");
    const failing: Notifier = {
      ...fakeNotifier(),
      async trigger() {
        throw failure;
      },
      async archiveByCommentId() {
        throw failure;
      },
    };
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      notifyRefundRequestRaised(db, failing, refundRequestId)
    ).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalledWith(expect.any(String), failure);
    logged.mockRestore();
  });
});

function addPerson(name: string, role: UserRole = UserRole.Student) {
  const email = `${name.split(" ")[0]?.toLowerCase()}@example.com`;
  return db.insert(schema.users).values({ name, email, role }).returning().get();
}

function seatsOf(purchaseId: number) {
  return db
    .select()
    .from(schema.coupons)
    .where(eq(schema.coupons.purchaseId, purchaseId))
    .all();
}

function claimSeat(seatId: number, userId: number) {
  db.update(schema.coupons)
    .set({ redeemedByUserId: userId, redeemedAt: NOW.toISOString() })
    .where(eq(schema.coupons.id, seatId))
    .run();
  return db
    .insert(schema.enrollments)
    .values({ userId, courseId: base.course.id })
    .returning()
    .get();
}

describe("notifySeatClaimed", () => {
  it("tells the Team Licence's buyer who claimed a Seat, on which course, and how many are left", async () => {
    const teamAdmin = addPerson("Tara Team");
    const purchase = buySeats(teamAdmin.id, 3);
    const [seat] = seatsOf(purchase.id);
    if (!seat) throw new Error("no seat");
    claimSeat(seat.id, base.user.id);
    const notifier = fakeNotifier();

    await notifySeatClaimed(db, notifier, seat.id);

    expect(notifier.triggers).toEqual([
      {
        workflow: "seat-claimed",
        recipients: [
          { id: String(teamAdmin.id), name: "Tara Team", email: "tara@example.com" },
        ],
        actor: { id: String(base.user.id), name: "Test User", email: "test@example.com" },
        data: {
          kind: "seat_claimed",
          actor_name: "Test User",
          course_title: "Test Course",
          seats_left: 2,
          url: "/team",
        },
        idempotencyKey: `seat:${seat.id}:claimed`,
      },
    ]);
  });

  it("doesn't count Seats already claimed or refunded as left", async () => {
    const teamAdmin = addPerson("Tara Team");
    const purchase = buySeats(teamAdmin.id, 5);
    const [claimedEarlier, refunded, seat] = seatsOf(purchase.id);
    if (!claimedEarlier || !refunded || !seat) throw new Error("no seats");
    claimSeat(claimedEarlier.id, addPerson("Cleo Claimer").id);
    db.update(schema.coupons)
      .set({ refundedAt: NOW.toISOString() })
      .where(eq(schema.coupons.id, refunded.id))
      .run();
    claimSeat(seat.id, base.user.id);
    const notifier = fakeNotifier();

    await notifySeatClaimed(db, notifier, seat.id);

    expect(notifier.triggers[0]?.data).toMatchObject({ seats_left: 2 });
  });

  it("still notifies when the last Seat is claimed, with none left", async () => {
    const teamAdmin = addPerson("Tara Team");
    const purchase = buySeats(teamAdmin.id, 1);
    const [seat] = seatsOf(purchase.id);
    if (!seat) throw new Error("no seat");
    claimSeat(seat.id, base.user.id);
    const notifier = fakeNotifier();

    await notifySeatClaimed(db, notifier, seat.id);

    expect(notifier.triggers).toHaveLength(1);
    expect(notifier.triggers[0]?.data).toMatchObject({ seats_left: 0 });
  });

  it("doesn't tell a Team Admin about claiming a Seat on their own Team Licence", async () => {
    const teamAdmin = addPerson("Tara Team");
    const purchase = buySeats(teamAdmin.id, 3);
    const [seat] = seatsOf(purchase.id);
    if (!seat) throw new Error("no seat");
    claimSeat(seat.id, teamAdmin.id);
    const notifier = fakeNotifier();

    await notifySeatClaimed(db, notifier, seat.id);

    expect(notifier.triggers).toEqual([]);
  });

  it("logs a Notifier failure instead of throwing it", async () => {
    const teamAdmin = addPerson("Tara Team");
    const purchase = buySeats(teamAdmin.id, 2);
    const [seat] = seatsOf(purchase.id);
    if (!seat) throw new Error("no seat");
    claimSeat(seat.id, base.user.id);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      notifySeatClaimed(db, failingNotifier(), seat.id)
    ).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe("notifyEnrollmentCreated", () => {
  function enroll(userId: number) {
    return db
      .insert(schema.enrollments)
      .values({ userId, courseId: base.course.id })
      .returning()
      .get();
  }

  it("tells the course's Instructor who enrolled, linking to the students page", async () => {
    const enrollment = enroll(base.user.id);
    const notifier = fakeNotifier();

    await notifyEnrollmentCreated(db, notifier, enrollment.id);

    expect(notifier.triggers).toEqual([
      {
        workflow: "enrollment-created",
        recipients: [
          {
            id: String(base.instructor.id),
            name: "Test Instructor",
            email: "instructor@example.com",
          },
        ],
        actor: { id: String(base.user.id), name: "Test User", email: "test@example.com" },
        data: {
          kind: "enrollment_created",
          actor_name: "Test User",
          course_title: "Test Course",
          url: `/instructor/${base.course.id}/students`,
        },
        idempotencyKey: `enrollment:${enrollment.id}:created`,
      },
    ]);
  });

  it("tells the Instructor about an Enrollment from a Claimed Seat", async () => {
    const purchase = buySeats(addPerson("Tara Team").id, 2);
    const [seat] = seatsOf(purchase.id);
    if (!seat) throw new Error("no seat");
    const enrollment = claimSeat(seat.id, base.user.id);
    const notifier = fakeNotifier();

    await notifyEnrollmentCreated(db, notifier, enrollment.id);

    expect(notifier.triggers).toMatchObject([
      {
        workflow: "enrollment-created",
        recipients: [{ id: String(base.instructor.id) }],
        idempotencyKey: `enrollment:${enrollment.id}:created`,
      },
    ]);
  });

  it("tells the Instructor again when a Lapsed Student enrolls again", async () => {
    const purchase = buyForSelf(base.user.id);
    approve(raise(purchase.id, base.user.id), platformAdmin.id, null);
    buyForSelf(base.user.id);
    const [reEnrollment] = db
      .select()
      .from(schema.enrollments)
      .where(eq(schema.enrollments.userId, base.user.id))
      .all();
    if (!reEnrollment) throw new Error("not enrolled again");
    const notifier = fakeNotifier();

    await notifyEnrollmentCreated(db, notifier, reEnrollment.id);

    expect(notifier.triggers).toMatchObject([
      { idempotencyKey: `enrollment:${reEnrollment.id}:created` },
    ]);
  });

  it("doesn't tell an Instructor about enrolling on their own course", async () => {
    const enrollment = enroll(base.instructor.id);
    const notifier = fakeNotifier();

    await notifyEnrollmentCreated(db, notifier, enrollment.id);

    expect(notifier.triggers).toEqual([]);
  });

  it("logs a Notifier failure instead of throwing it", async () => {
    const enrollment = enroll(base.user.id);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      notifyEnrollmentCreated(db, failingNotifier(), enrollment.id)
    ).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

function failingNotifier(): Notifier {
  return {
    ...fakeNotifier(),
    async trigger() {
      throw new Error("Knock is down");
    },
    async archiveByCommentId() {
      throw new Error("Knock is down");
    },
  };
}

describe("notifyCommentPosted", () => {
  let lesson: typeof schema.lessons.$inferSelect;

  beforeEach(() => {
    const module = db
      .insert(schema.modules)
      .values({ courseId: base.course.id, title: "Basics", position: 1 })
      .returning()
      .get();
    lesson = db
      .insert(schema.lessons)
      .values({ moduleId: module.id, title: "Hooks", position: 1 })
      .returning()
      .get();
  });

  function post(userId: number, body: string, parentId: number | null = null) {
    return db
      .insert(schema.comments)
      .values({ lessonId: lesson.id, userId, parentId, body })
      .returning()
      .get();
  }

  it("tells the course's Instructor about a Student's Discussion Question", async () => {
    const question = post(base.user.id, "Why does useEffect run twice?");
    const notifier = fakeNotifier();

    await notifyCommentPosted(db, notifier, question.id);

    expect(notifier.triggers).toEqual([
      {
        workflow: "discussion-question-posted",
        recipients: [
          {
            id: String(base.instructor.id),
            name: "Test Instructor",
            email: "instructor@example.com",
          },
        ],
        actor: { id: String(base.user.id), name: "Test User", email: "test@example.com" },
        data: {
          kind: "discussion_question",
          commentId: question.id,
          actor_name: "Test User",
          course_title: "Test Course",
          lesson_title: "Hooks",
          snippet: "Why does useEffect run twice?",
          url: `/courses/test-course/lessons/${lesson.id}#comment-${question.id}`,
        },
        idempotencyKey: `comment:${question.id}:posted`,
      },
    ]);
  });

  it("tells the Instructor about a Platform Admin's Discussion Question too", async () => {
    const question = post(platformAdmin.id, "Is this still current?");
    const notifier = fakeNotifier();

    await notifyCommentPosted(db, notifier, question.id);

    expect(notifier.triggers).toMatchObject([
      {
        workflow: "discussion-question-posted",
        recipients: [{ id: String(base.instructor.id) }],
        data: { actor_name: "Pat Admin" },
      },
    ]);
  });

  it("sends nothing for the Instructor's own top-level comment, which isn't a Discussion Question", async () => {
    const comment = post(base.instructor.id, "Welcome to the lesson!");
    const notifier = fakeNotifier();

    await notifyCommentPosted(db, notifier, comment.id);

    expect(notifier.triggers).toEqual([]);
  });

  it("tells only the Discussion Question's author about a Discussion Reply", async () => {
    const question = post(base.user.id, "Why does useEffect run twice?");
    const classmate = db
      .insert(schema.users)
      .values({ name: "Cleo Classmate", email: "cleo@example.com", role: UserRole.Student })
      .returning()
      .get();
    post(classmate.id, "Same question here.", question.id);
    const reply = post(base.instructor.id, "Strict Mode mounts it twice.", question.id);
    const notifier = fakeNotifier();

    await notifyCommentPosted(db, notifier, reply.id);

    expect(notifier.triggers).toEqual([
      {
        workflow: "discussion-reply-posted",
        recipients: [
          { id: String(base.user.id), name: "Test User", email: "test@example.com" },
        ],
        actor: {
          id: String(base.instructor.id),
          name: "Test Instructor",
          email: "instructor@example.com",
        },
        data: {
          kind: "discussion_reply",
          commentId: reply.id,
          actor_name: "Test Instructor",
          course_title: "Test Course",
          lesson_title: "Hooks",
          snippet: "Strict Mode mounts it twice.",
          url: `/courses/test-course/lessons/${lesson.id}#comment-${reply.id}`,
        },
        idempotencyKey: `comment:${reply.id}:posted`,
      },
    ]);
  });

  it("sends nothing when the Discussion Question's author replies in their own thread", async () => {
    const question = post(base.user.id, "Why does useEffect run twice?");
    const reply = post(base.user.id, "Never mind, found it.", question.id);
    const notifier = fakeNotifier();

    await notifyCommentPosted(db, notifier, reply.id);

    expect(notifier.triggers).toEqual([]);
  });

  it("snips the comment to plain text", async () => {
    const question = post(
      base.user.id,
      "## Help\n\nWhy does **`useEffect`** run [twice](https://react.dev)?\n\n```ts\nuseEffect(() => {});\n```"
    );
    const notifier = fakeNotifier();

    await notifyCommentPosted(db, notifier, question.id);

    expect(notifier.triggers[0]?.data.snippet).toBe(
      "Help Why does useEffect run twice? useEffect(() => {});"
    );
  });

  it("truncates a long comment's snippet", async () => {
    const question = post(base.user.id, `${"word ".repeat(100)}end`);
    const notifier = fakeNotifier();

    await notifyCommentPosted(db, notifier, question.id);

    expect(notifier.triggers[0]?.data.snippet).toBe(`${"word ".repeat(27)}word…`);
  });

  it("logs a Notifier failure instead of throwing it", async () => {
    const question = post(base.user.id, "Why does useEffect run twice?");
    const failure = new Error("Knock is down");
    const failing: Notifier = {
      ...fakeNotifier(),
      async trigger() {
        throw failure;
      },
      async archiveByCommentId() {
        throw failure;
      },
    };
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(notifyCommentPosted(db, failing, question.id)).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalledWith(expect.any(String), failure);
    logged.mockRestore();
  });
});

describe("archiveCommentNotifications", () => {
  let lesson: typeof schema.lessons.$inferSelect;

  beforeEach(() => {
    const module = db
      .insert(schema.modules)
      .values({ courseId: base.course.id, title: "Basics", position: 1 })
      .returning()
      .get();
    lesson = db
      .insert(schema.lessons)
      .values({ moduleId: module.id, title: "Hooks", position: 1 })
      .returning()
      .get();
  });

  function post(userId: number, parentId: number | null = null) {
    return db
      .insert(schema.comments)
      .values({ lessonId: lesson.id, userId, parentId, body: "A comment" })
      .returning()
      .get();
  }

  function softDelete(commentId: number) {
    db.update(schema.comments)
      .set({ deletedAt: NOW.toISOString() })
      .where(eq(schema.comments.id, commentId))
      .run();
  }

  it("archives the deleted comment's Notifications by its commentId", async () => {
    const question = post(base.user.id);
    softDelete(question.id);
    const notifier = fakeNotifier();

    await archiveCommentNotifications(db, notifier, question.id);

    expect(notifier.archivedCommentIds).toEqual([question.id]);
  });

  it("leaves the Notifications for a deleted Discussion Question's replies", async () => {
    const question = post(base.user.id);
    post(base.instructor.id, question.id);
    softDelete(question.id);
    const notifier = fakeNotifier();

    await archiveCommentNotifications(db, notifier, question.id);

    expect(notifier.archivedCommentIds).toEqual([question.id]);
  });

  it("archives nothing for a comment that isn't deleted", async () => {
    const question = post(base.user.id);
    const notifier = fakeNotifier();

    await archiveCommentNotifications(db, notifier, question.id);

    expect(notifier.archivedCommentIds).toEqual([]);
  });

  it("logs a Notifier failure instead of throwing it", async () => {
    const question = post(base.user.id);
    softDelete(question.id);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      archiveCommentNotifications(db, failingNotifier(), question.id)
    ).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

