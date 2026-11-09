// PROTOTYPE: turns a Knock feed item's `data` into what a Notification row says.
// The seed script (scripts/prototype-seed-knock-feed.ts) sends this shape.
import {
  CheckCircle2,
  XCircle,
  Receipt,
  UserPlus,
  GraduationCap,
  MessageSquare,
  Reply,
  Bell,
} from "lucide-react";
import type { FeedItem } from "./use-knock-feed";

export interface Described {
  icon: React.ReactNode;
  tone: string; // tailwind text colour for the icon
  actor: string | null;
  title: React.ReactNode; // one sentence
  detail: string | null; // snippet, note, reason…
  context: string | null; // course · lesson
  url: string;
}

export function describe(item: FeedItem): Described {
  const d = item.data ?? {};
  const b = (s: string) => <strong className="font-semibold">{s}</strong>;
  switch (d.kind) {
    case "refund_approved":
      return {
        icon: <CheckCircle2 className="size-4" />,
        tone: "text-emerald-600",
        actor: null,
        title: <>Your Refund Request for {b(d.course_title)} was approved</>,
        detail: d.note ?? null,
        context: d.course_title,
        url: d.url,
      };
    case "refund_declined":
      return {
        icon: <XCircle className="size-4" />,
        tone: "text-rose-600",
        actor: null,
        title: <>Your Refund Request for {b(d.course_title)} was declined</>,
        detail: d.note ? `${d.note} You can ask again.` : "You can ask again.",
        context: d.course_title,
        url: d.url,
      };
    case "refund_requested":
      return {
        icon: <Receipt className="size-4" />,
        tone: "text-amber-600",
        actor: d.actor_name,
        title: (
          <>
            {b(d.actor_name)} asked for a {d.amount} refund on {b(d.course_title)}
          </>
        ),
        detail: d.reason ?? null,
        context: d.course_title,
        url: d.url,
      };
    case "seat_claimed":
      return {
        icon: <UserPlus className="size-4" />,
        tone: "text-sky-600",
        actor: d.actor_name,
        title: (
          <>
            {b(d.actor_name)} claimed a Seat on {b(d.course_title)}
          </>
        ),
        detail: `${d.seats_left} Seats left`,
        context: d.course_title,
        url: d.url,
      };
    case "enrollment":
      return {
        icon: <GraduationCap className="size-4" />,
        tone: "text-violet-600",
        actor: d.actor_name,
        title: (
          <>
            {b(d.actor_name)} enrolled in {b(d.course_title)}
          </>
        ),
        detail: null,
        context: d.course_title,
        url: d.url,
      };
    case "discussion_question":
      return {
        icon: <MessageSquare className="size-4" />,
        tone: "text-primary",
        actor: d.actor_name,
        title: (
          <>
            {b(d.actor_name)} asked a question on {b(d.lesson_title)}
          </>
        ),
        detail: d.snippet ?? null,
        context: `${d.course_title} · ${d.lesson_title}`,
        url: d.url,
      };
    case "discussion_reply":
      return {
        icon: <Reply className="size-4" />,
        tone: "text-primary",
        actor: d.actor_name,
        title: (
          <>
            {b(d.actor_name)} replied to your question on {b(d.lesson_title)}
          </>
        ),
        detail: d.snippet ?? null,
        context: `${d.course_title} · ${d.lesson_title}`,
        url: d.url,
      };
    default:
      return {
        icon: <Bell className="size-4" />,
        tone: "text-muted-foreground",
        actor: null,
        title: <>Unknown Notification ({String(d.kind)})</>,
        detail: JSON.stringify(d),
        context: null,
        url: "/",
      };
  }
}

export function timeAgo(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}
