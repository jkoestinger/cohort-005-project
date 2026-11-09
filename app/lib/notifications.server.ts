import { and, count, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import {
  coupons,
  courses,
  enrollments,
  purchases,
  refunds,
  RefundStatus,
  users,
} from "~/db/schema";
import { getPurchaseKind, type Db } from "~/lib/refunds.server";
import type { Notifier, Recipient, Trigger } from "~/lib/notifier.server";

// ─── Notifications ───
// Who is told about what. Each function is shaped like an event, takes the
// database and the Notifier first (project convention: db-first, positional),
// and is called by a route after its database write has succeeded. Each one:
//
// - loads what it needs by id,
// - works out the recipients and drops whoever caused the event (nobody is
//   notified about their own action),
// - builds the data and the idempotency key,
// - triggers through the Notifier,
// - catches and logs any Notifier error and never throws, so a missed
//   Notification never rolls back what the person did.
//
// The data shapes are the Notification data contract in issue #28: the Feed
// rows are built from them in Cadence, and Knock's email templates read them.

function toRecipient(user: { id: number; name: string; email: string }): Recipient {
  return { id: String(user.id), name: user.name, email: user.email };
}

/** Triggers through the Notifier, logging any failure instead of throwing it. */
async function send(notifier: Notifier, trigger: Trigger): Promise<void> {
  try {
    await notifier.trigger(trigger);
  } catch (error) {
    console.error(
      `[notifications] Could not trigger ${trigger.workflow} (${trigger.idempotencyKey}):`,
      error
    );
  }
}

// ─── Refund Requests ───

const DECISIONS: Partial<
  Record<RefundStatus, { workflow: string; kind: string }>
> = {
  [RefundStatus.Approved]: {
    workflow: "refund-request-approved",
    kind: "refund_request_approved",
  },
  [RefundStatus.Declined]: {
    workflow: "refund-request-declined",
    kind: "refund_request_declined",
  },
};

/** Tells the buyer their Refund Request was approved or declined. */
export async function notifyRefundRequestDecided(
  db: Db,
  notifier: Notifier,
  refundRequestId: number
): Promise<void> {
  const row = db
    .select({
      status: refunds.status,
      purchaseId: refunds.purchaseId,
      note: refunds.decisionNote,
      decidedBy: refunds.resolvedByUserId,
      buyer: { id: users.id, name: users.name, email: users.email },
      courseTitle: courses.title,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(eq(refunds.id, refundRequestId))
    .get();

  if (!row) return;
  const decision = DECISIONS[row.status];
  if (!decision) return;
  if (row.decidedBy === row.buyer.id) return;

  await send(notifier, {
    workflow: decision.workflow,
    recipients: [toRecipient(row.buyer)],
    data: {
      kind: decision.kind,
      course_title: row.courseTitle,
      ...(row.note ? { note: row.note } : {}),
      // Where the buyer sees their Refund Requests.
      url:
        getPurchaseKind(db, row.purchaseId) === "team_licence"
          ? "/team"
          : "/settings",
    },
    idempotencyKey: `refund:${refundRequestId}:${row.status}`,
  });
}

// ─── Seats ───

const claimants = alias(users, "claimant");

/** Tells the Team Licence's buyer that one of its Seats was claimed. */
export async function notifySeatClaimed(
  db: Db,
  notifier: Notifier,
  seatId: number
): Promise<void> {
  const row = db
    .select({
      purchaseId: coupons.purchaseId,
      buyer: { id: users.id, name: users.name, email: users.email },
      claimant: { id: claimants.id, name: claimants.name, email: claimants.email },
      courseTitle: courses.title,
    })
    .from(coupons)
    .innerJoin(purchases, eq(coupons.purchaseId, purchases.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .innerJoin(claimants, eq(coupons.redeemedByUserId, claimants.id))
    .innerJoin(courses, eq(coupons.courseId, courses.id))
    .where(eq(coupons.id, seatId))
    .get();

  if (!row) return;
  if (row.claimant.id === row.buyer.id) return;

  // Unclaimed Seats that can still be claimed: not claimed, not refunded.
  const unclaimed = db
    .select({ n: count() })
    .from(coupons)
    .where(
      and(
        eq(coupons.purchaseId, row.purchaseId),
        isNull(coupons.redeemedAt),
        isNull(coupons.refundedAt)
      )
    )
    .get();

  await send(notifier, {
    workflow: "seat-claimed",
    recipients: [toRecipient(row.buyer)],
    actor: toRecipient(row.claimant),
    data: {
      kind: "seat_claimed",
      actor_name: row.claimant.name,
      course_title: row.courseTitle,
      seats_left: unclaimed?.n ?? 0,
      url: "/team",
    },
    idempotencyKey: `seat:${seatId}:claimed`,
  });
}

// ─── Enrollments ───

const instructors = alias(users, "instructor");

/**
 * Tells the course's Instructor about a new Enrollment, from an Individual
 * Purchase or a Claimed Seat. New Enrollment is off by default, but that is a
 * Knock preference: this always triggers.
 */
export async function notifyEnrollmentCreated(
  db: Db,
  notifier: Notifier,
  enrollmentId: number
): Promise<void> {
  const row = db
    .select({
      student: { id: users.id, name: users.name, email: users.email },
      instructor: {
        id: instructors.id,
        name: instructors.name,
        email: instructors.email,
      },
      courseId: courses.id,
      courseTitle: courses.title,
    })
    .from(enrollments)
    .innerJoin(users, eq(enrollments.userId, users.id))
    .innerJoin(courses, eq(enrollments.courseId, courses.id))
    .innerJoin(instructors, eq(courses.instructorId, instructors.id))
    .where(eq(enrollments.id, enrollmentId))
    .get();

  if (!row) return;
  if (row.student.id === row.instructor.id) return;

  await send(notifier, {
    workflow: "enrollment-created",
    recipients: [toRecipient(row.instructor)],
    actor: toRecipient(row.student),
    data: {
      kind: "enrollment_created",
      actor_name: row.student.name,
      course_title: row.courseTitle,
      url: `/instructor/${row.courseId}/students`,
    },
    idempotencyKey: `enrollment:${enrollmentId}:created`,
  });
}
