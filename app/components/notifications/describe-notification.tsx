import type { ReactNode } from "react";
import type { FeedItem } from "@knocklabs/client";
import { CheckCircle2, XCircle } from "lucide-react";
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

const notificationDataSchema = z.discriminatedUnion("kind", [refundDecidedSchema]);

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
