// PROTOTYPE Variant A — "Bell popover".
// Bell in the sidebar header, badge = UNSEEN count. Opening the popover marks
// everything seen (badge clears) but leaves rows unread. Clicking a row marks
// it read and navigates. Compact rows, one line of detail.
// Footer link opens the full Notifications page (variant C's page): A + C merged.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "~/lib/utils";
import { UserAvatar } from "~/components/user-avatar";
import { useFeed } from "./use-knock-feed";
import { describe, timeAgo } from "./describe";

export function VariantABell() {
  const feed = useFeed();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const unseen = feed.items.filter((i) => !i.seen_at).map((i) => i.id);
    feed.markAs(unseen, "seen");
    function onDown(e: MouseEvent) {
      if (!panel.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div ref={panel} className="relative ml-auto">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent"
        title="Notifications"
      >
        <Bell className="size-5" />
        {feed.unseenCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
            {feed.unseenCount > 9 ? "9+" : feed.unseenCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed left-52 top-3 z-50 w-96 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            <button
              onClick={() =>
                feed.markAs(feed.items.filter((i) => !i.read_at).map((i) => i.id), "read")
              }
              disabled={feed.unreadCount === 0}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <CheckCheck className="size-3.5" /> Mark all as read
            </button>
          </div>
          <div className="max-h-[28rem] overflow-y-auto">
            {feed.items.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">You're all caught up.</div>
            )}
            {feed.items.map((item) => {
              const n = describe(item);
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (!item.read_at) feed.markAs([item.id], "read");
                    setOpen(false);
                    navigate(n.url);
                  }}
                  className={cn(
                    "flex w-full gap-3 border-b px-4 py-3 text-left text-sm last:border-0 hover:bg-accent",
                    !item.read_at && "bg-primary/5"
                  )}
                >
                  <div className="relative shrink-0">
                    {n.actor ? (
                      <UserAvatar name={n.actor} avatarUrl={null} />
                    ) : (
                      <div className={cn("flex size-8 items-center justify-center rounded-full bg-muted", n.tone)}>{n.icon}</div>
                    )}
                    {n.actor && (
                      <span className={cn("absolute -bottom-1 -right-1 rounded-full bg-popover p-0.5", n.tone)}>{n.icon}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="leading-snug">{n.title}</div>
                    {n.detail && <div className="mt-0.5 truncate text-xs text-muted-foreground">{n.detail}</div>}
                    <div className="mt-1 text-xs text-muted-foreground">{timeAgo(item.inserted_at)}</div>
                  </div>
                  {!item.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
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
        </div>
      )}
    </div>
  );
}
