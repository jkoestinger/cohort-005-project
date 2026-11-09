import { useState } from "react";
import { Link, data } from "react-router";
import { ArrowRight, Settings } from "lucide-react";
import type { Route } from "./+types/notifications";
import { getCurrentUserId } from "~/lib/session";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { useFeed } from "~/components/notifications/notification-feed-provider";
import { NotificationAvatar } from "~/components/notifications/notification-avatar";
import {
  describeFeedItems,
  timeAgo,
} from "~/components/notifications/describe-notification";
import { UnreadDot } from "~/components/notifications/unread-dot";

// ─── /notifications ───
// Every Notification in a dense list, filterable by course, with the selected
// one in a detail pane. Selecting marks it read without leaving the page; "Go
// to it" is how you leave. Reached from the bell's "View all Notifications".

export function meta() {
  return [
    { title: "Notifications — Cadence" },
    { name: "description", content: "Everything that happened that concerns you" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to see your Notifications.", {
      status: 401,
    });
  }
  return null;
}

const ALL_COURSES = null;

export default function NotificationsPage() {
  const feed = useFeed();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [course, setCourse] = useState<string | null>(ALL_COURSES);

  if (!feed.ready) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Notifications aren't available right now.
      </div>
    );
  }

  const rows = describeFeedItems(feed.items);
  const courses = [...new Set(rows.map((row) => row.described.courseTitle))];
  const shown = rows.filter(
    (row) => course === ALL_COURSES || row.described.courseTitle === course
  );
  const selected = rows.find((row) => row.item.id === selectedId) ?? null;

  return (
    <div className="flex h-full">
      <div className="flex w-[26rem] shrink-0 flex-col border-r">
        <div className="border-b p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold">Notifications</h1>
              <p className="text-sm text-muted-foreground">
                {feed.unreadCount} unread of {feed.totalCount}
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/settings#notifications">
                <Settings />
                Preferences
              </Link>
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[ALL_COURSES, ...courses].map((title) => (
              <button
                key={title ?? "all"}
                type="button"
                onClick={() => setCourse(title)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs",
                  course === title
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-accent"
                )}
              >
                {title ?? "All courses"}
              </button>
            ))}
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {shown.map(({ item, described }) => {
            const unread = !item.read_at;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(item.id);
                    feed.markAsRead(item);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 border-b px-4 py-2 text-left text-sm hover:bg-accent",
                    selectedId === item.id && "bg-accent",
                    unread && "font-semibold"
                  )}
                >
                  <span className={cn("shrink-0", described.tone)}>{described.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{described.title}</span>
                  <span className="shrink-0 text-xs font-normal text-muted-foreground">
                    {timeAgo(item.inserted_at)}
                  </span>
                  {unread && <UnreadDot />}
                </button>
              </li>
            );
          })}
          {shown.length === 0 && (
            <li className="p-8 text-center text-sm text-muted-foreground">
              Nothing here.
            </li>
          )}
          {feed.hasMore && (
            <li className="p-3 text-center">
              <Button variant="ghost" size="sm" onClick={feed.loadMore}>
                Load older Notifications
              </Button>
            </li>
          )}
        </ul>
      </div>

      <div className="flex-1 overflow-y-auto p-10">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Select a Notification
          </div>
        ) : (
          <article className="max-w-xl">
            <div className="flex items-center gap-3">
              <NotificationAvatar notification={selected.described} className="size-10" />
              <div className="text-sm text-muted-foreground">
                <div>{selected.described.context}</div>
                <div>{new Date(selected.item.inserted_at).toLocaleString()}</div>
              </div>
            </div>
            <h2 className="mt-4 text-xl leading-snug">{selected.described.title}</h2>
            {selected.described.detail && (
              <p className="mt-4 whitespace-pre-line rounded-md bg-muted p-4 text-sm">
                {selected.described.detail}
              </p>
            )}
            <div className="mt-6 flex gap-2">
              <Button asChild>
                <Link to={selected.described.url}>
                  Go to it
                  <ArrowRight />
                </Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => feed.markAsUnread(selected.item)}
                disabled={!selected.item.read_at}
              >
                Mark as unread
              </Button>
            </div>
          </article>
        )}
      </div>
    </div>
  );
}
