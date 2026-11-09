import type { ReactNode } from "react";
import type { FeedItem } from "@knocklabs/client";
import {
  CheckCircle2,
  MessageSquare,
  ReceiptText,
  Reply,
  Ticket,
  UserPlus,
  XCircle,
} from "lucide-react";
import { z } from "zod";
import type { NotificationKind } from "~/lib/notification-kinds";

// ─── What a Notification row says ───
// Rows are built in Cadence from each Notification's `data` (the data
// contract in issue #28), not from Knock's rendered templates. Add a kind by
// adding it to NOTIFICATION_KINDS, a schema to the union and a case to
// `describeNotification`; the type checker points at whichever is missing.

const url = z.string().startsWith("/");

/** A `kind` literal, checked against the kinds Cadence triggers. */
function kind<K extends NotificationKind>(value: K) {
  return z.literal(value);
}

const refundDecidedSchema = z.object({
  course_title: z.string(),
  // Optional: Notifications sent before it was added don't have it.
  purchase_date: z.string().optional(),
  note: z.string().optional(),
  url,
});

const refundOpenedSchema = z.object({
  kind: kind("refund_request_opened"),
  actor_name: z.string(),
  course_title: z.string(),
  amount: z.string(),
  reason: z.string(),
  url,
});

const seatClaimedSchema = z.object({
  kind: kind("seat_claimed"),
  actor_name: z.string(),
  course_title: z.string(),
  seats_left: z.number().int().nonnegative(),
  url,
});

const enrollmentCreatedSchema = z.object({
  kind: kind("enrollment_created"),
  actor_name: z.string(),
  course_title: z.string(),
  url,
});

const discussionSchema = z.object({
  commentId: z.number().int(),
  actor_name: z.string(),
  course_title: z.string(),
  lesson_title: z.string(),
  snippet: z.string(),
  url,
});

const notificationDataSchema = z.discriminatedUnion("kind", [
  refundDecidedSchema.extend({ kind: kind("refund_request_approved") }),
  refundDecidedSchema.extend({ kind: kind("refund_request_declined") }),
  refundOpenedSchema,
  seatClaimedSchema,
  enrollmentCreatedSchema,
  discussionSchema.extend({ kind: kind("discussion_question") }),
  discussionSchema.extend({ kind: kind("discussion_reply") }),
]);

/**
 * Fails to type-check while a kind Cadence triggers has no schema above, so
 * its rows would be dropped as unknown.
 */
type EveryKindIsDescribed = [
  Exclude<NotificationKind, z.infer<typeof notificationDataSchema>["kind"]>,
] extends [never]
  ? true
  : never;
const everyKindIsDescribed: EveryKindIsDescribed = true;
void everyKindIsDescribed;

export type DescribedNotification = {
  icon: ReactNode;
  /** Tailwind text colour for the icon. */
  tone: string;
  /** Who caused it, shown as an avatar; null when nobody did (just the icon). */
  actor: string | null;
  /** One sentence, key names in bold. */
  title: ReactNode;
  detail: string | null;
  /** The course it's about, for filtering by course. */
  courseTitle: string;
  /** Where it happened: the course, or "course · lesson". */
  context: string;
  url: string;
};

function bold(text: string) {
  return <strong className="font-semibold">{text}</strong>;
}

function boughtOn(purchaseDate: string | undefined) {
  return purchaseDate ? `Bought ${purchaseDate}.` : undefined;
}

function joinSentences(...sentences: (string | undefined)[]) {
  return sentences.filter(Boolean).join(" ");
}

/** What to show for a Feed item, or null for a kind Cadence doesn't know. */
export function describeNotification(item: FeedItem): DescribedNotification | null {
  const parsed = notificationDataSchema.safeParse(item.data);
  if (!parsed.success) return null;
  const data = parsed.data;

  switch (data.kind) {
    case "refund_request_approved":
      return {
        icon: <CheckCircle2 className="size-4" />,
        tone: "text-emerald-600",
        actor: null,
        title: <>Your Refund Request for {bold(data.course_title)} was approved</>,
        detail: joinSentences(boughtOn(data.purchase_date), data.note) || null,
        courseTitle: data.course_title,
        context: data.course_title,
        url: data.url,
      };
    case "refund_request_declined":
      return {
        icon: <XCircle className="size-4" />,
        tone: "text-rose-600",
        actor: null,
        title: <>Your Refund Request for {bold(data.course_title)} was declined</>,
        detail: joinSentences(boughtOn(data.purchase_date), data.note, "You can ask again."),
        courseTitle: data.course_title,
        context: data.course_title,
        url: data.url,
      };
    case "refund_request_opened":
      return {
        icon: <ReceiptText className="size-4" />,
        tone: "text-amber-600",
        actor: data.actor_name,
        title: (
          <>
            {bold(data.actor_name)} asked for a {data.amount} refund on{" "}
            {bold(data.course_title)}
          </>
        ),
        detail: data.reason,
        courseTitle: data.course_title,
        context: data.course_title,
        url: data.url,
      };
    case "seat_claimed":
      return {
        icon: <Ticket className="size-4" />,
        tone: "text-sky-600",
        actor: data.actor_name,
        title: (
          <>
            {bold(data.actor_name)} claimed a Seat for {bold(data.course_title)}
          </>
        ),
        detail:
          data.seats_left === 0
            ? "No Seats left."
            : `${data.seats_left} ${data.seats_left === 1 ? "Seat" : "Seats"} left.`,
        courseTitle: data.course_title,
        context: data.course_title,
        url: data.url,
      };
    case "enrollment_created":
      return {
        icon: <UserPlus className="size-4" />,
        tone: "text-violet-600",
        actor: data.actor_name,
        title: (
          <>
            {bold(data.actor_name)} enrolled in {bold(data.course_title)}
          </>
        ),
        detail: null,
        courseTitle: data.course_title,
        context: data.course_title,
        url: data.url,
      };
    case "discussion_question":
    case "discussion_reply":
      return {
        icon:
          data.kind === "discussion_question" ? (
            <MessageSquare className="size-4" />
          ) : (
            <Reply className="size-4" />
          ),
        tone: "text-primary",
        actor: data.actor_name,
        title: (
          <>
            {bold(data.actor_name)}{" "}
            {data.kind === "discussion_question"
              ? "asked a question on"
              : "replied to your question on"}{" "}
            {bold(data.lesson_title)}
          </>
        ),
        detail: data.snippet,
        courseTitle: data.course_title,
        context: `${data.course_title} · ${data.lesson_title}`,
        url: data.url,
      };
    default: {
      const unhandled: never = data;
      return unhandled;
    }
  }
}

/** The Feed items Cadence can show, each with its row; unknown kinds are dropped. */
export function describeFeedItems(
  items: FeedItem[]
): { item: FeedItem; described: DescribedNotification }[] {
  return items.flatMap((item) => {
    const described = describeNotification(item);
    return described ? [{ item, described }] : [];
  });
}

/** The bell's badge for this many unseen Notifications, or null for none. */
export function badgeLabel(unseenCount: number): string | null {
  if (unseenCount <= 0) return null;
  return unseenCount > 9 ? "9+" : String(unseenCount);
}

export function timeAgo(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
