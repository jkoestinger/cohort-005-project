import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Popover } from "radix-ui";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "~/lib/utils";
import { useFeed } from "./notification-feed-provider";
import { NotificationAvatar } from "./notification-avatar";
import { badgeLabel, describeFeedItems, timeAgo } from "./describe-notification";
import { UnreadDot } from "./unread-dot";

// ─── The bell ───
// Sits next to "Cadence" in the sidebar header. The badge counts unseen
// Notifications; the popover lists them, unread ones tinted with a dot.
// Hidden when the Feed can't be authenticated.

export function NotificationBell() {
  const feed = useFeed();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (!feed.ready) return null;

  const rows = describeFeedItems(feed.items);
  const badge = badgeLabel(feed.unseenCount);

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
          {badge && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
              {badge}
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
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            <button
              type="button"
              onClick={feed.markAllAsRead}
              disabled={feed.unreadCount === 0}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <CheckCheck className="size-3.5" />
              Mark all as read
            </button>
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
                  <NotificationAvatar notification={described} />
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
                  {unread && <UnreadDot className="mt-1.5" />}
                </button>
              );
            })}
          </div>
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t px-4 py-2.5 text-center text-sm font-medium text-primary hover:bg-accent"
          >
            View all Notifications
          </Link>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
