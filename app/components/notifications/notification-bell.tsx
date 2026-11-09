import { useState } from "react";
import { useNavigate } from "react-router";
import { Popover } from "radix-ui";
import { Bell } from "lucide-react";
import { cn } from "~/lib/utils";
import type { FeedAuth } from "~/lib/notification-feed.server";
import { useNotificationFeed } from "./use-notification-feed";
import { describeNotification, timeAgo } from "./describe-notification";

// ─── The bell ───
// Sits next to "Cadence" in the sidebar header. The badge counts unseen
// Notifications; the popover lists them, unread ones tinted with a dot.
// Hidden when the Feed can't be authenticated.

export function NotificationBell({ auth }: { auth: FeedAuth | null }) {
  const feed = useNotificationFeed(auth);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (!auth || !feed.ready) return null;

  const rows = feed.items.flatMap((item) => {
    const described = describeNotification(item);
    return described ? [{ item, described }] : [];
  });

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && feed.unseenCount > 0) feed.markAllAsSeen();
  }

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Notifications"
          title="Notifications"
          className="relative ml-auto rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent"
        >
          <Bell className="size-5" />
          {feed.unseenCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
              {feed.unseenCount > 9 ? "9+" : feed.unseenCount}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="start"
          sideOffset={12}
          className="z-50 w-96 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl"
        >
          <div className="border-b px-4 py-2.5 text-sm font-semibold">
            Notifications
          </div>
          <div className="max-h-[28rem] overflow-y-auto">
            {rows.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                You're all caught up.
              </div>
            )}
            {rows.map(({ item, described }) => {
              const unread = !item.read_at;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    feed.markAsRead(item);
                    setOpen(false);
                    navigate(described.url);
                  }}
                  className={cn(
                    "flex w-full gap-3 border-b px-4 py-3 text-left text-sm last:border-0 hover:bg-accent",
                    unread && "bg-primary/5"
                  )}
                >
                  <div
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full bg-muted",
                      described.tone
                    )}
                  >
                    {described.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="leading-snug">{described.title}</div>
                    {described.detail && (
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {described.detail}
                      </div>
                    )}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {timeAgo(item.inserted_at)}
                    </div>
                  </div>
                  {unread && (
                    <span
                      aria-label="Unread"
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
