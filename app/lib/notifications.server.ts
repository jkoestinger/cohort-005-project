import { and, count, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { marked, type Token } from "marked";
import { formatPrice } from "~/lib/utils";
import {
  comments,
  coupons,
  courses,
  enrollments,
  lessons,
  modules,
  purchases,
  refunds,
  RefundStatus,
  UserRole,
  users,
} from "~/db/schema";
import { getPurchaseKind, type Db } from "~/lib/refunds.server";
import type {
  ChannelPreference,
  Notifier,
  Recipient,
  Trigger,
} from "~/lib/notifier.server";

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

// ─── Notification Preferences ───
// Which Notifications a person can get, and whether each reaches them at all
// (Notify me, which is their Feed) and by email. Knock stores the choices; the
// defaults live here, so what a person sees doesn't depend on whether Knock
// returns its environment defaults when nothing is stored.

/** Who a Notification can reach. */
type Person = { role: UserRole; ownsTeamLicence: boolean };

type PreferenceRowDefinition = {
  workflow: string;
  label: string;
  /** What applies while the person has nothing stored. */
  defaults: ChannelPreference;
  canGet: (person: Person) => boolean;
};

const ON: ChannelPreference = { in_app_feed: true, email: true };
const EVERYONE = () => true;

// In the order /settings lists them.
const PREFERENCE_ROWS: PreferenceRowDefinition[] = [
  { workflow: "refund-request-approved", label: "Refund Request approved", defaults: ON, canGet: EVERYONE },
  { workflow: "refund-request-declined", label: "Refund Request declined", defaults: ON, canGet: EVERYONE },
  { workflow: "discussion-reply-posted", label: "Discussion Reply", defaults: ON, canGet: EVERYONE },
  {
    workflow: "seat-claimed",
    label: "Seat claimed",
    // A large Team Licence would flood the inbox.
    defaults: { in_app_feed: true, email: false },
    canGet: (person) => person.ownsTeamLicence,
  },
  {
    workflow: "enrollment-created",
    label: "New Enrollment",
    // Opt-in: a popular course would flood the Feed.
    defaults: { in_app_feed: false, email: false },
    canGet: (person) => person.role === UserRole.Instructor,
  },
  {
    workflow: "discussion-question-posted",
    label: "New Discussion Question",
    defaults: ON,
    canGet: (person) => person.role === UserRole.Instructor,
  },
  {
    workflow: "refund-request-opened",
    label: "New Open Refund Request",
    defaults: ON,
    canGet: (person) => person.role === UserRole.Admin,
  },
];

export type NotificationPreferenceRow = {
  workflow: string;
  label: string;
  notifyMe: boolean;
  email: boolean;
};

function loadPerson(db: Db, userId: number): Person {
  const user = db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!user) throw new Error(`User ${userId} not found.`);

  // A Team Licence is a Purchase that granted Seats.
  const teamLicence = db
    .select({ id: purchases.id })
    .from(purchases)
    .innerJoin(coupons, eq(coupons.purchaseId, purchases.id))
    .where(eq(purchases.userId, userId))
    .get();
  return { role: user.role, ownsTeamLicence: teamLicence !== undefined };
}

/** The Notification Preferences this person can set, with their effective values. */
export async function listNotificationPreferences(
  db: Db,
  notifier: Notifier,
  userId: number
): Promise<NotificationPreferenceRow[]> {
  const person = loadPerson(db, userId);
  const rows = PREFERENCE_ROWS.filter((row) => row.canGet(person));
  const stored = await notifier.getPreferences(String(userId));
  return rows.map(({ workflow, label, defaults }) => {
    const notifyMe = stored[workflow]?.in_app_feed ?? defaults.in_app_feed;
    const email = stored[workflow]?.email ?? defaults.email;
    return { workflow, label, notifyMe, email: notifyMe && email };
  });
}

/** Thrown for a Notification the person can't get, so has no row to set. */
export class UnknownNotificationPreferenceError extends Error {
  constructor(workflow: string) {
    super(`No Notification Preference "${workflow}" for this person.`);
    this.name = "UnknownNotificationPreferenceError";
  }
}

/**
 * Stores one Notification Preference. Turning Notify me off turns email off
 * too: Knock never holds "Feed off, email on" for Cadence.
 */
export async function setNotificationPreference(
  db: Db,
  notifier: Notifier,
  userId: number,
  workflow: string,
  choice: { notifyMe: boolean; email: boolean }
): Promise<void> {
  const person = loadPerson(db, userId);
  const row = PREFERENCE_ROWS.find((row) => row.workflow === workflow);
  if (!row || !row.canGet(person)) {
    throw new UnknownNotificationPreferenceError(workflow);
  }

  await notifier.setPreference(String(userId), workflow, {
    in_app_feed: choice.notifyMe,
    email: choice.notifyMe && choice.email,
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

/**
 * Takes a deleted Discussion Question's or Discussion Reply's own
 * Notification out of the recipient's Notification Feed, so nobody follows a
 * link to it. Notifications about other comments in the thread stay, and sent
 * emails stay sent. Call it once, right after the soft delete.
 */
export async function archiveCommentNotifications(
  db: Db,
  notifier: Notifier,
  commentId: number
): Promise<void> {
  const comment = db
    .select({ deletedAt: comments.deletedAt })
    .from(comments)
    .where(eq(comments.id, commentId))
    .get();
  // A live comment's Notifications stay.
  if (!comment || comment.deletedAt === null) return;

  try {
    await notifier.archiveByCommentId(commentId);
  } catch (error) {
    console.error(
      `[notifications] Could not archive the Notifications for comment ${commentId}:`,
      error
    );
  }
}
