import { eq } from "drizzle-orm";
import { courses, purchases, refunds, RefundStatus, users } from "~/db/schema";
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
