import type { ReactNode } from "react";
import type { FeedItem } from "@knocklabs/client";
import { CheckCircle2, MessageSquare, ReceiptText, Reply, XCircle } from "lucide-react";
import { z } from "zod";

// ─── What a Notification row says ───
// Rows are built in Cadence from each Notification's `data` (the data
// contract in issue #28), not from Knock's rendered templates. Add a kind by
// adding a schema to the union and a case to `describeNotification`.

const refundDecidedSchema = z.object({
  kind: z.enum(["refund_request_approved", "refund_request_declined"]),
  course_title: z.string(),
  note: z.string().optional(),
  url: z.string().startsWith("/"),
});

const refundOpenedSchema = z.object({
  kind: z.literal("refund_request_opened"),
  actor_name: z.string(),
  course_title: z.string(),
  amount: z.string(),
  reason: z.string(),
  url: z.string().startsWith("/"),
});

const discussionSchema = z.object({
  kind: z.enum(["discussion_question", "discussion_reply"]),
  actor_name: z.string(),
  course_title: z.string(),
  lesson_title: z.string(),
  snippet: z.string(),
  url: z.string().startsWith("/"),
});

const notificationDataSchema = z.discriminatedUnion("kind", [
  refundDecidedSchema,
  refundOpenedSchema,
  discussionSchema,
]);

export type DescribedNotification = {
  icon: ReactNode;
  /** Tailwind text colour for the icon. */
  tone: string;
  /** One sentence, key names in bold. */
  title: ReactNode;
  detail: string | null;
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
        title: <>Your Refund Request for {bold(data.course_title)} was approved</>,
        detail: data.note ?? null,
        url: data.url,
      };
    case "refund_request_declined":
      return {
        icon: <XCircle className="size-4" />,
        tone: "text-rose-600",
        title: <>Your Refund Request for {bold(data.course_title)} was declined</>,
        detail: data.note ? `${data.note} You can ask again.` : "You can ask again.",
        url: data.url,
      };
    case "refund_request_opened":
      return {
        icon: <ReceiptText className="size-4" />,
        tone: "text-amber-600",
        title: (
          <>
            {bold(data.actor_name)} asked for a {data.amount} refund on{" "}
            {bold(data.course_title)}
          </>
        ),
        detail: data.reason,
        url: data.url,
      };
    case "discussion_question":
      return {
        icon: <MessageSquare className="size-4" />,
        tone: "text-primary",
        title: (
          <>
            {bold(data.actor_name)} asked a question on {bold(data.lesson_title)}
          </>
        ),
        detail: data.snippet,
        url: data.url,
      };
    case "discussion_reply":
      return {
        icon: <Reply className="size-4" />,
        tone: "text-primary",
        title: (
          <>
            {bold(data.actor_name)} replied to your question on {bold(data.lesson_title)}
          </>
        ),
        detail: data.snippet,
        url: data.url,
      };
  }
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
