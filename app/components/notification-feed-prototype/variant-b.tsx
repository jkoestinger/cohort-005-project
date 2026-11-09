// PROTOTYPE Variant B — "Right-hand drawer".
// A "Notifications" nav item with an UNREAD pill (no separate seen state).
// Opens a full-height drawer from the right: Unread / All tabs, grouped by
// Today / Earlier, roomy rows that quote the snippet. Each row has hover
// actions to toggle read and to archive (dismiss). Clicking a row marks it
// read and navigates, the drawer stays open so you can work down the list.
import { useState } from "react";
import { useNavigate } from "react-router";
import { Archive, Bell, Circle, CircleDot, X } from "lucide-react";
import { cn } from "~/lib/utils";
import { useFeed, type FeedItem } from "./use-knock-feed";
import { describe, isToday, timeAgo } from "./describe";

export function VariantBDrawer() {
  const feed = useFeed();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"unread" | "all">("unread");

  const shown = feed.items.filter((i) => tab === "all" || !i.read_at);
  const groups: [string, FeedItem[]][] = [
    ["Today", shown.filter((i) => isToday(i.inserted_at))],
    ["Earlier", shown.filter((i) => !isToday(i.inserted_at))],
  ];

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          open
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        <Bell className="size-4" />
        Notifications
        {feed.unreadCount > 0 && (
          <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
            {feed.unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-[28rem] flex-col border-l bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="text-lg font-semibold">Notifications</h2>
            <button onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-accent">
              <X className="size-5" />
            </button>
          </div>
          <div className="flex items-center gap-1 border-b px-5 py-2">
            {(["unread", "all"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm capitalize",
                  tab === t ? "bg-accent font-semibold" : "text-muted-foreground hover:bg-accent"
                )}
              >
                {t} {t === "unread" ? `(${feed.unreadCount})` : `(${feed.totalCount})`}
              </button>
            ))}
            <button
              onClick={() => feed.markAs(feed.items.filter((i) => !i.read_at).map((i) => i.id), "read")}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            >
              Mark all as read
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {shown.length === 0 && (
              <div className="p-10 text-center text-sm text-muted-foreground">
                {tab === "unread" ? "No unread Notifications." : "No Notifications yet."}
              </div>
            )}
            {groups.map(([label, items]) =>
              items.length === 0 ? null : (
                <section key={label}>
                  <div className="sticky top-0 bg-muted/80 px-5 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {label}
                  </div>
                  {items.map((item) => {
                    const n = describe(item);
                    return (
                      <div
                        key={item.id}
                        className={cn("group relative flex gap-3 border-b px-5 py-4", !item.read_at && "border-l-4 border-l-primary pl-4")}
                      >
                        <div className={cn("mt-0.5 shrink-0", n.tone)}>{n.icon}</div>
                        <button
                          className="min-w-0 flex-1 text-left"
                          onClick={() => {
                            if (!item.read_at) feed.markAs([item.id], "read");
                            navigate(n.url);
                          }}
                        >
                          <div className={cn("text-sm leading-snug", item.read_at && "text-muted-foreground")}>{n.title}</div>
                          {n.detail && (
                            <blockquote className="mt-2 line-clamp-3 border-l-2 pl-3 text-sm text-muted-foreground">
                              {n.detail}
                            </blockquote>
                          )}
                          <div className="mt-2 text-xs text-muted-foreground">
                            {n.context} · {timeAgo(item.inserted_at)}
                          </div>
                        </button>
                        <div className="absolute right-3 top-3 hidden gap-1 group-hover:flex">
                          <button
                            title={item.read_at ? "Mark as unread" : "Mark as read"}
                            onClick={() => feed.markAs([item.id], item.read_at ? "unread" : "read")}
                            className="rounded-md border bg-background p-1 hover:bg-accent"
                          >
                            {item.read_at ? <CircleDot className="size-3.5" /> : <Circle className="size-3.5" />}
                          </button>
                          <button
                            title="Archive"
                            onClick={() => feed.markAs([item.id], "archived")}
                            className="rounded-md border bg-background p-1 hover:bg-accent"
                          >
                            <Archive className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </section>
              )
            )}
          </div>
        </div>
      )}
    </>
  );
}
