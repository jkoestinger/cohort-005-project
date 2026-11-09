import { eq } from "drizzle-orm";
import { marked, type Token } from "marked";
import { formatPrice } from "~/lib/utils";
import {
  comments,
  courses,
  lessons,
  modules,
  purchases,
  refunds,
  RefundStatus,
  UserRole,
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

/** Tells every Platform Admin, other than the buyer, about a new Open Refund Request. */
export async function notifyRefundRequestRaised(
  db: Db,
  notifier: Notifier,
  refundRequestId: number
): Promise<void> {
  const row = db
    .select({
      reason: refunds.reason,
      amountPaid: purchases.amountPaid,
      buyer: { id: users.id, name: users.name },
      courseTitle: courses.title,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(eq(refunds.id, refundRequestId))
    .get();

  if (!row) return;

  // Read at trigger time, so a newly promoted admin is included.
  const admins = db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.role, UserRole.Admin))
    .all()
    .filter((admin) => admin.id !== row.buyer.id);

  if (admins.length === 0) return;

  await send(notifier, {
    workflow: "refund-request-opened",
    recipients: admins.map(toRecipient),
    data: {
      kind: "refund_request_opened",
      actor_name: row.buyer.name,
      course_title: row.courseTitle,
      amount: formatPrice(row.amountPaid),
      reason: row.reason,
      url: "/admin/refunds",
    },
    idempotencyKey: `refund:${refundRequestId}:opened`,
  });
}

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

// ─── Discussions ───

const SNIPPET_LENGTH = 140;

/** The words of a markdown token, without its markup or any raw HTML. */
function plainText(token: Token): string {
  if (token.type === "html") return "";
  if (token.type === "list") {
    return token.items.map((item: Token) => plainText(item)).join(" ");
  }
  if ("tokens" in token && token.tokens) {
    const separator = token.type === "blockquote" || token.type === "list_item" ? " " : "";
    return token.tokens.map(plainText).join(separator);
  }
  return "text" in token ? token.text : "";
}

/** A comment body as one line of plain text, cut to fit a Feed row. */
function snippetOf(markdown: string): string {
  const text = marked
    .lexer(markdown)
    .map(plainText)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= SNIPPET_LENGTH) return text;
  return `${text.slice(0, SNIPPET_LENGTH - 1).trimEnd()}…`;
}

function getUser(db: Db, userId: number) {
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .get();
}

/**
 * Tells the course's Instructor about a new Discussion Question, or the
 * Discussion Question's author about a new Discussion Reply. Nobody else in
 * the thread is told. Call it after inserting a comment, never after an edit.
 */
export async function notifyCommentPosted(
  db: Db,
  notifier: Notifier,
  commentId: number
): Promise<void> {
  const row = db
    .select({
      id: comments.id,
      body: comments.body,
      parentId: comments.parentId,
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      instructorId: courses.instructorId,
      author: { id: users.id, name: users.name, email: users.email },
    })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .innerJoin(lessons, eq(comments.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(comments.id, commentId))
    .get();
  if (!row) return;

  // A Discussion Question goes to the course's Instructor, a Discussion
  // Reply to the Discussion Question's author.
  const parentId = row.parentId;
  const isReply = parentId !== null;
  const recipientId = isReply
    ? db
        .select({ authorId: comments.userId })
        .from(comments)
        .where(eq(comments.id, parentId))
        .get()?.authorId
    : row.instructorId;
  if (recipientId === undefined) return;
  // The Instructor's own top-level comment isn't a Discussion Question, and
  // a Discussion Question's author isn't told about replying to themselves.
  if (recipientId === row.author.id) return;

  const recipient = getUser(db, recipientId);
  if (!recipient) return;

  await send(notifier, {
    workflow: isReply ? "discussion-reply-posted" : "discussion-question-posted",
    recipients: [toRecipient(recipient)],
    actor: toRecipient(row.author),
    data: {
      kind: isReply ? "discussion_reply" : "discussion_question",
      // Top level, so a deleted comment's Notifications can be archived by it.
      commentId: row.id,
      actor_name: row.author.name,
      course_title: row.courseTitle,
      lesson_title: row.lessonTitle,
      snippet: snippetOf(row.body),
      url: `/courses/${row.courseSlug}/lessons/${row.lessonId}#comment-${row.id}`,
    },
    idempotencyKey: `comment:${row.id}:posted`,
  });
}
