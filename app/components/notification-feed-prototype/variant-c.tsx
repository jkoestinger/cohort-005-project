// PROTOTYPE Variant C — "Notifications page".
// A "Notifications" nav item (UNREAD count) that goes to a full page,
// /notifications. Two panes: a dense list on the left (filter by course,
// unread first-class), the selected Notification on the right with an
// explicit "Go to …" button. Selecting a row marks it read; it does NOT
// navigate away, so the page is a place you triage from.
import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router";
import { ArrowRight, Bell } from "lucide-react";
import { cn } from "~/lib/utils";
import { UserAvatar } from "~/components/user-avatar";
import { useFeed } from "./use-knock-feed";
import { describe, timeAgo } from "./describe";

export function VariantCNavItem() {
  const feed = useFeed();
  return (
    <NavLink
      to="/notifications?variant=C"
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )
      }
    >
      <Bell className="size-4" />
      Notifications
      {feed.unreadCount > 0 && (
        <span className="ml-auto text-xs font-semibold text-primary">{feed.unreadCount} new</span>
      )}
    </NavLink>
  );
}

export function VariantCPage() {
  const feed = useFeed();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [course, setCourse] = useState<string>("all");

  const courses = [...new Set(feed.items.map((i) => i.data?.course_title).filter(Boolean))] as string[];
  const shown = feed.items.filter((i) => course === "all" || i.data?.course_title === course);
  const selected = feed.items.find((i) => i.id === selectedId) ?? null;

  useEffect(() => {
    if (selected && !selected.read_at) feed.markAs([selected.id], "read");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return (
    <div className="flex h-full">
      <div className="flex w-[26rem] shrink-0 flex-col border-r">
        <div className="border-b p-4">
          <h1 className="text-xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            {feed.unreadCount} unread of {feed.totalCount}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {["all", ...courses].map((c) => (
              <button
                key={c}
                onClick={() => setCourse(c)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs",
                  course === c ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
                )}
              >
                {c === "all" ? "All courses" : c}
              </button>
            ))}
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {shown.map((item) => {
            const n = describe(item);
            return (
              <li key={item.id}>
                <button
                  onClick={() => setSelectedId(item.id)}
                  className={cn(
                    "flex w-full items-center gap-2 border-b px-4 py-2 text-left text-sm hover:bg-accent",
                    selectedId === item.id && "bg-accent",
                    !item.read_at && "font-semibold"
                  )}
                >
                  <span className={cn("shrink-0", n.tone)}>{n.icon}</span>
                  <span className="min-w-0 flex-1 truncate font-normal [&_strong]:font-inherit">{n.title}</span>
                  <span className="shrink-0 text-xs font-normal text-muted-foreground">{timeAgo(item.inserted_at)}</span>
                  {!item.read_at && <span className="size-2 shrink-0 rounded-full bg-primary" />}
                </button>
              </li>
            );
          })}
          {shown.length === 0 && <li className="p-8 text-center text-sm text-muted-foreground">Nothing here.</li>}
        </ul>
      </div>

      <div className="flex-1 p-10">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">Select a Notification</div>
        ) : (
          (() => {
            const n = describe(selected);
            return (
              <article className="max-w-xl">
                <div className="flex items-center gap-3">
                  {n.actor && <UserAvatar name={n.actor} avatarUrl={null} className="size-10" />}
                  <div className="text-sm text-muted-foreground">
                    {n.context}
                    <br />
                    {new Date(selected.inserted_at).toLocaleString()}
                  </div>
                </div>
                <h2 className="mt-4 text-xl leading-snug">{n.title}</h2>
                {n.detail && <p className="mt-4 whitespace-pre-line rounded-md bg-muted p-4 text-sm">{n.detail}</p>}
                <div className="mt-6 flex gap-2">
                  <Link
                    to={n.url}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                  >
                    Go to it <ArrowRight className="size-4" />
                  </Link>
                  <button
                    onClick={() => feed.markAs([selected.id], "unread")}
                    className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
                  >
                    Mark as unread
                  </button>
                </div>
              </article>
            );
          })()
        )}
      </div>
    </div>
  );
}
