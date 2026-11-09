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

// ─── What a Notification row says ───
// Rows are built in Cadence from each Notification's `data` (the data
// contract in issue #28), not from Knock's rendered templates. Add a kind by
// adding a schema to the union and a case to `describeNotification`.

const url = z.string().startsWith("/");

const refundDecidedSchema = z.object({
  kind: z.enum(["refund_request_approved", "refund_request_declined"]),
  course_title: z.string(),
  note: z.string().optional(),
  url,
});

const refundOpenedSchema = z.object({
  kind: z.literal("refund_request_opened"),
  actor_name: z.string(),
  course_title: z.string(),
  amount: z.string(),
  reason: z.string(),
  url,
});

const seatClaimedSchema = z.object({
  kind: z.literal("seat_claimed"),
  actor_name: z.string(),
  course_title: z.string(),
  seats_left: z.number().int().nonnegative(),
  url,
});

const enrollmentCreatedSchema = z.object({
  kind: z.literal("enrollment_created"),
  actor_name: z.string(),
  course_title: z.string(),
  url,
});

const discussionSchema = z.object({
  kind: z.enum(["discussion_question", "discussion_reply"]),
  actor_name: z.string(),
  course_title: z.string(),
  lesson_title: z.string(),
  snippet: z.string(),
  url,
});

const notificationDataSchema = z.discriminatedUnion("kind", [
  refundDecidedSchema,
  refundOpenedSchema,
  seatClaimedSchema,
  enrollmentCreatedSchema,
  discussionSchema,
]);

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
        detail: data.note ?? null,
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
        detail: data.note ? `${data.note} You can ask again.` : "You can ask again.",
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
  }
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
