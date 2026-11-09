// PROTOTYPE: throwaway. Wayfinder ticket "Prototype the bell and feed UI" (#5).
// Three variants of the Notification bell and feed, mounted in the real app
// layout and switchable with ?variant=A|B|C (or ← / →). State lives in memory
// only: no Knock, no database writes. Copy is the v1 catalogue's draft copy.
//
//   A  Knock prebuilt feed, restyled: bell in the sidebar header, popover,
//      badge = unseen count, opening clears the badge, click marks read.
//   B  Our own shadcn on Knock's headless hooks: "Notifications" sidebar nav
//      item, right-hand sheet, badge = unread count, Today/Earlier groups,
//      per-type icons, toast on live arrival.
//   C  New top bar with a bell (dot only), a short dropdown that marks what
//      it shows as read, and a full-page inbox with filters and bulk actions.
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import {
  Popover as PopoverPrimitive,
  Dialog as DialogPrimitive,
  DropdownMenu as DropdownPrimitive,
} from "radix-ui";
import {
  Archive,
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  CircleCheck,
  MessageSquare,
  MessageSquareReply,
  Receipt,
  ReceiptText,
  Undo2,
  UserPlus,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { PrototypeSwitcher } from "~/components/prototype-switcher";

// ---------------------------------------------------------------- data

type NType =
  | "refund-approved"
  | "refund-declined"
  | "open-refund"
  | "seat-claimed"
  | "new-question"
  | "new-reply";

type Item = {
  id: string;
  type: NType;
  actor: string;
  body: string;
  url: string;
  minutesAgo: number;
  seen: boolean;
  read: boolean;
  archived: boolean;
};

export type PrototypeSample = {
  courseTitle: string;
  courseSlug: string;
  lessonTitle: string;
  lessonId: number;
};

const TYPE_META: Record<
  NType,
  { label: string; icon: typeof Bell; tint: string; category: Category }
> = {
  "refund-approved": {
    label: "Refund approved",
    icon: CircleCheck,
    tint: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    category: "refunds",
  },
  "refund-declined": {
    label: "Refund declined",
    icon: XCircle,
    tint: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    category: "refunds",
  },
  "open-refund": {
    label: "Open Refund Request",
    icon: Receipt,
    tint: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    category: "refunds",
  },
  "seat-claimed": {
    label: "Seat claimed",
    icon: UserPlus,
    tint: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    category: "seats",
  },
  "new-question": {
    label: "New Question",
    icon: MessageSquare,
    tint: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    category: "questions",
  },
  "new-reply": {
    label: "New Reply",
    icon: MessageSquareReply,
    tint: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
    category: "questions",
  },
};

type Category = "refunds" | "questions" | "seats";

let seq = 0;

function make(
  type: NType,
  s: PrototypeSample,
  minutesAgo: number,
  opts: { actor?: string; teamPurchase?: boolean; read?: boolean } = {}
): Item {
  const lessonUrl = `/courses/${s.courseSlug}/lessons/${s.lessonId}#question-${100 + seq}`;
  const refundUrl = opts.teamPurchase ? "/team" : "/settings";
  const c = s.courseTitle;
  const l = s.lessonTitle;
  const actors: Record<NType, string> = {
    "refund-approved": "Cadence",
    "refund-declined": "Cadence",
    "open-refund": "Priya Shah",
    "seat-claimed": "Sam Lee",
    "new-question": "Alex Kim",
    "new-reply": "Dana Ortiz",
  };
  const actor = opts.actor ?? actors[type];
  const bodies: Record<NType, [string, string]> = {
    "refund-approved": [
      `Your refund request for ${c} was approved. €49.00 is on its way back to you.`,
      refundUrl,
    ],
    "refund-declined": [
      `Your refund request for ${c} was declined: More than half of the course was already completed.`,
      refundUrl,
    ],
    "open-refund": [
      `${actor} asked for a refund on ${c} (€49.00).`,
      "/admin/refunds",
    ],
    "seat-claimed": [
      `${actor} claimed a Seat on ${c}. ${3 + (seq % 5)}/10 Seats claimed.`,
      "/team",
    ],
    "new-question": [
      `${actor} asked a question on ${l}: "Why does the effect run twice in development? I thought StrictMode only…"`,
      lessonUrl,
    ],
    "new-reply": [`${actor} replied to your question on ${l}.`, lessonUrl],
  };
  seq++;
  const read = opts.read ?? false;
  return {
    id: `n${seq}`,
    type,
    actor,
    body: bodies[type][0],
    url: bodies[type][1],
    minutesAgo,
    seen: read,
    read,
    archived: false,
  };
}

function rolePool(role: string | null, isTeamAdmin: boolean): NType[] {
  const pool: NType[] = [];
  if (role === "student") pool.push("new-reply", "refund-approved", "refund-declined");
  if (role === "instructor") pool.push("new-question", "new-reply");
  if (role === "admin") pool.push("open-refund", "new-reply");
  if (isTeamAdmin) pool.push("seat-claimed", "refund-approved");
  return pool.length ? pool : ["new-reply"];
}

function buildFeed(
  role: string | null,
  isTeamAdmin: boolean,
  allTypes: boolean,
  s: PrototypeSample
): Item[] {
  seq = 0;
  if (allTypes) {
    return [
      make("open-refund", s, 3),
      make("new-question", s, 12),
      make("seat-claimed", s, 47),
      make("new-reply", s, 130, { actor: "Morgan Reyes" }),
      make("refund-approved", s, 60 * 26, { read: true }),
      make("refund-declined", s, 60 * 24 * 4, { read: true }),
    ];
  }
  const items: Item[] = [];
  if (role === "student") {
    items.push(
      make("new-reply", s, 8, { actor: "Morgan Reyes" }),
      make("new-reply", s, 95),
      make("refund-approved", s, 60 * 30, { read: true })
    );
  }
  if (role === "instructor") {
    items.push(
      make("new-question", s, 2),
      make("new-question", s, 40, { actor: "Jordan Patel" }),
      make("new-reply", s, 60 * 5, { actor: "Riley Chen" }),
      make("new-question", s, 60 * 28, { actor: "Casey Wu", read: true }),
      make("new-question", s, 60 * 24 * 3, { actor: "Taylor Brooks", read: true })
    );
  }
  if (role === "admin") {
    items.push(
      make("open-refund", s, 5),
      make("open-refund", s, 60 * 3, { actor: "Lukas Weber" }),
      make("open-refund", s, 60 * 27, { actor: "Ana Costa", read: true })
    );
  }
  if (isTeamAdmin) {
    items.push(
      make("seat-claimed", s, 15),
      make("seat-claimed", s, 60 * 2, { actor: "Noor Haddad" }),
      make("refund-approved", s, 60 * 24 * 2, { teamPurchase: true, read: true })
    );
  }
  return items.sort((a, b) => a.minutesAgo - b.minutesAgo);
}

function ago(m: number) {
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / (60 * 24))}d`;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// ---------------------------------------------------------------- state

const VARIANTS = [
  { key: "A", name: "Knock prebuilt, restyled" },
  { key: "B", name: "Sidebar item + sheet" },
  { key: "C", name: "Top bar + inbox page" },
];

type Ctx = ReturnType<typeof useProtoState>;
const ProtoCtx = createContext<Ctx | null>(null);
const useProto = () => useContext(ProtoCtx)!;

function useProtoState(
  role: string | null,
  isTeamAdmin: boolean,
  sample: PrototypeSample
) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [stored, setStored] = useState<string | null>(null);
  useEffect(() => setStored(sessionStorage.getItem("proto-notif-variant")), []);
  const variant = params.get("variant") ?? stored ?? "A";

  const [allTypes, setAllTypes] = useState(false);
  const [items, setItems] = useState<Item[]>(() =>
    buildFeed(role, isTeamAdmin, false, sample)
  );
  const [inboxOpen, setInboxOpen] = useState(false);

  // Reseed when the DevUI user changes.
  useEffect(() => {
    setItems(buildFeed(role, isTeamAdmin, allTypes, sample));
  }, [role, isTeamAdmin, allTypes]);

  useEffect(() => setInboxOpen(false), [location.pathname]);

  const patch = (pred: (i: Item) => boolean, p: Partial<Item>) =>
    setItems((xs) => xs.map((i) => (pred(i) ? { ...i, ...p } : i)));

  return {
    variant,
    setVariant(v: string) {
      sessionStorage.setItem("proto-notif-variant", v);
      setStored(v);
      const next = new URLSearchParams(params);
      next.set("variant", v);
      setParams(next, { replace: true });
    },
    items,
    visible: items.filter((i) => !i.archived),
    allTypes,
    setAllTypes,
    inboxOpen,
    setInboxOpen,
    markAllSeen: () => patch(() => true, { seen: true }),
    markSeenRead: (ids: string[]) =>
      patch((i) => ids.includes(i.id), { seen: true, read: true }),
    markRead: (id: string) => patch((i) => i.id === id, { seen: true, read: true }),
    markUnread: (id: string) => patch((i) => i.id === id, { read: false }),
    markAllRead: () =>
      patch((i) => !i.archived, { seen: true, read: true }),
    archive: (id: string) => patch((i) => i.id === id, { archived: true, seen: true }),
    unarchive: (id: string) => patch((i) => i.id === id, { archived: false }),
    empty: () => setItems([]),
    reset: () => setItems(buildFeed(role, isTeamAdmin, allTypes, sample)),
    arrive() {
      const pool = allTypes
        ? (Object.keys(TYPE_META) as NType[])
        : rolePool(role, isTeamAdmin);
      const type = pool[Math.floor(Math.random() * pool.length)];
      const item = make(type, sample, 0, { actor: "Jamie Fox" });
      setItems((xs) => [item, ...xs.map((x) => ({ ...x, minutesAgo: x.minutesAgo + 1 }))]);
      return item;
    },
    go(url: string) {
      const [path, hash] = url.split("#");
      navigate(`${path}?variant=${variant}${hash ? `#${hash}` : ""}`);
    },
  };
}

export function NotificationsPrototype({
  role,
  isTeamAdmin,
  sample,
  children,
}: {
  role: string | null;
  isTeamAdmin: boolean;
  sample: PrototypeSample;
  children: ReactNode;
}) {
  const state = useProtoState(role, isTeamAdmin, sample);
  return <ProtoCtx.Provider value={state}>{children}</ProtoCtx.Provider>;
}

// Slots the layout and sidebar render; each only shows for its variant.
export function ProtoSidebarHeaderSlot() {
  return useProto().variant === "A" ? <ABell /> : null;
}
export function ProtoSidebarNavSlot() {
  return useProto().variant === "B" ? <BNavItem /> : null;
}
export function ProtoMain({ children }: { children: ReactNode }) {
  const p = useProto();
  if (p.variant !== "C") return <>{children}</>;
  return (
    <div className="flex h-full flex-col">
      <CTopBar />
      <div className="flex-1 overflow-y-auto">
        {p.inboxOpen ? <CInbox /> : children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- A

function ABell() {
  const p = useProto();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const unseen = p.visible.filter((i) => !i.seen).length;
  const list = p.visible.filter((i) =>
    filter === "all" ? true : filter === "unread" ? !i.read : i.read
  );

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) p.markAllSeen();
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        <button
          className="relative ml-auto rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          aria-label="Notifications"
        >
          <Bell className="size-5" />
          {unseen > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unseen > 9 ? "9+" : unseen}
            </span>
          )}
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="right"
          align="start"
          sideOffset={12}
          className="z-50 w-[380px] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl"
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="font-semibold">Notifications</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              className="rounded-md border bg-background px-2 py-1 text-xs"
            >
              <option value="all">All</option>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
            </select>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {list.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm font-medium">No notifications yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  We'll let you know when we've got something new for you.
                </p>
              </div>
            ) : (
              list.map((i) => (
                <div
                  key={i.id}
                  onClick={() => {
                    p.markRead(i.id);
                    setOpen(false);
                    p.go(i.url);
                  }}
                  className="group relative flex cursor-pointer gap-3 border-b px-4 py-3 last:border-b-0 hover:bg-muted/50"
                >
                  <span
                    className={cn(
                      "absolute left-1.5 top-5 size-1.5 rounded-full",
                      i.read ? "bg-transparent" : "bg-primary"
                    )}
                  />
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                    {initials(i.actor)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug">{i.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {ago(i.minutesAgo)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      p.archive(i.id);
                    }}
                    className="invisible self-start rounded p-1 text-muted-foreground hover:bg-muted group-hover:visible"
                    aria-label="Archive"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="border-t px-4 py-2 text-right">
            <button
              onClick={p.markAllRead}
              className="text-xs font-medium text-primary hover:underline"
            >
              Mark all as read
            </button>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

// ---------------------------------------------------------------- B

function BNavItem() {
  const p = useProto();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"unread" | "all">("unread");
  const unread = p.visible.filter((i) => !i.read).length;
  const list = p.visible.filter((i) => (tab === "unread" ? !i.read : true));
  const today = list.filter((i) => i.minutesAgo < 60 * 24);
  const earlier = list.filter((i) => i.minutesAgo >= 60 * 24);

  // Live arrivals toast in this variant.
  useEffect(() => {
    (window as any).__protoToast = (i: Item) =>
      toast(TYPE_META[i.type].label, {
        description: i.body,
        action: {
          label: "View",
          onClick: () => {
            p.markRead(i.id);
            p.go(i.url);
          },
        },
      });
    return () => {
      delete (window as any).__protoToast;
    };
  });

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            open
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )}
        >
          <Bell className="size-4" />
          Notifications
          {unread > 0 && (
            <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none text-primary-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/20" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-[420px] flex-col border-l bg-background shadow-2xl">
          <div className="flex items-center gap-2 border-b px-5 py-4">
            <DialogPrimitive.Title className="text-lg font-semibold">
              Notifications
            </DialogPrimitive.Title>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={p.markAllRead}
              disabled={unread === 0}
            >
              <CheckCheck className="size-4" />
              Mark all read
            </Button>
            <DialogPrimitive.Close className="rounded-md p-1 hover:bg-muted">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex gap-1 border-b px-5 py-2">
            {(["unread", "all"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium capitalize",
                  tab === t
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t}
                {t === "unread" && unread > 0 && ` (${unread})`}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            {list.length === 0 ? (
              <BEmpty tab={tab} onSeeAll={() => setTab("all")} />
            ) : (
              <>
                <BGroup title="Today" items={today} close={() => setOpen(false)} />
                <BGroup title="Earlier" items={earlier} close={() => setOpen(false)} />
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function BEmpty({ tab, onSeeAll }: { tab: string; onSeeAll: () => void }) {
  const p = useProto();
  if (tab === "unread" && p.visible.length > 0) {
    return (
      <div className="flex flex-col items-center px-8 py-16 text-center">
        <CircleCheck className="size-10 text-emerald-500" />
        <p className="mt-3 font-medium">You're all caught up</p>
        <button onClick={onSeeAll} className="mt-2 text-sm text-primary hover:underline">
          See all notifications
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center px-8 py-16 text-center">
      <BellOff className="size-10 text-muted-foreground" />
      <p className="mt-3 font-medium">No notifications yet</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Replies to your questions, refund decisions, new Questions on your
        courses and claimed Seats will show up here.
      </p>
    </div>
  );
}

function BGroup({
  title,
  items,
  close,
}: {
  title: string;
  items: Item[];
  close: () => void;
}) {
  const p = useProto();
  if (items.length === 0) return null;
  return (
    <section>
      <h3 className="bg-muted/40 px-5 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {items.map((i) => {
        const meta = TYPE_META[i.type];
        const Icon = meta.icon;
        return (
          <div
            key={i.id}
            onClick={() => {
              p.markRead(i.id);
              close();
              p.go(i.url);
            }}
            className={cn(
              "group flex cursor-pointer gap-3 border-b px-5 py-3 hover:bg-muted/50",
              !i.read && "bg-primary/[0.04]"
            )}
          >
            <div
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-md",
                meta.tint
              )}
            >
              <Icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={cn(!i.read && "font-semibold text-foreground")}>
                  {meta.label}
                </span>
                <span>·</span>
                <span>{ago(i.minutesAgo)}</span>
                {!i.read && (
                  <span className="ml-auto size-2 rounded-full bg-primary" />
                )}
              </div>
              <p className="mt-0.5 text-sm leading-snug">{i.body}</p>
              <div className="mt-1.5 hidden gap-3 text-xs text-muted-foreground group-hover:flex">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    i.read ? p.markUnread(i.id) : p.markRead(i.id);
                  }}
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  {i.read ? <Undo2 className="size-3" /> : <Check className="size-3" />}
                  {i.read ? "Mark unread" : "Mark read"}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    p.archive(i.id);
                  }}
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  <Archive className="size-3" />
                  Archive
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------- C

function CTopBar() {
  const p = useProto();
  const [open, setOpen] = useState(false);
  const hasUnseen = p.visible.some((i) => !i.seen);
  const latest = p.visible.slice(0, 5);

  return (
    <header className="flex h-14 shrink-0 items-center justify-end border-b px-6">
      <DropdownPrimitive.Root
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          // Seen in the dropdown = read.
          if (!o) p.markSeenRead(latest.map((i) => i.id));
          else p.markAllSeen();
        }}
      >
        <DropdownPrimitive.Trigger asChild>
          <button
            className="relative rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Notifications"
          >
            <Bell className="size-5" />
            {hasUnseen && (
              <span className="absolute right-1.5 top-1.5 size-2.5 rounded-full border-2 border-background bg-rose-500" />
            )}
          </button>
        </DropdownPrimitive.Trigger>
        <DropdownPrimitive.Portal>
          <DropdownPrimitive.Content
            align="end"
            sideOffset={6}
            className="z-50 w-[340px] rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl"
          >
            {latest.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nothing new
              </div>
            ) : (
              latest.map((i) => {
                const Icon = TYPE_META[i.type].icon;
                return (
                  <DropdownPrimitive.Item
                    key={i.id}
                    onSelect={() => p.go(i.url)}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm outline-none data-[highlighted]:bg-muted"
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className={cn("truncate", !i.read && "font-semibold")}>
                      {i.body}
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {ago(i.minutesAgo)}
                    </span>
                  </DropdownPrimitive.Item>
                );
              })
            )}
            <DropdownPrimitive.Separator className="my-1 h-px bg-border" />
            <DropdownPrimitive.Item
              onSelect={() => p.setInboxOpen(true)}
              className="cursor-pointer rounded-md px-2 py-2 text-center text-sm font-medium text-primary outline-none data-[highlighted]:bg-muted"
            >
              View all notifications
            </DropdownPrimitive.Item>
          </DropdownPrimitive.Content>
        </DropdownPrimitive.Portal>
      </DropdownPrimitive.Root>
    </header>
  );
}

const C_FILTERS: { key: "all" | Category | "archived"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "refunds", label: "Refunds" },
  { key: "questions", label: "Questions & Replies" },
  { key: "seats", label: "Seats" },
  { key: "archived", label: "Archived" },
];

function CInbox() {
  const p = useProto();
  const [filter, setFilter] = useState<(typeof C_FILTERS)[number]["key"]>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const match = (i: Item, f: typeof filter) =>
    f === "archived"
      ? i.archived
      : !i.archived && (f === "all" || TYPE_META[i.type].category === f);
  const list = p.items.filter((i) => match(i, filter));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const bulk = (fn: (id: string) => void) => {
    selected.forEach(fn);
    setSelected(new Set());
  };

  return (
    <div className="mx-auto max-w-5xl p-8">
      <button
        onClick={() => p.setInboxOpen(false)}
        className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back
      </button>
      <h1 className="text-2xl font-bold">Notifications</h1>
      <div className="mt-6 flex gap-8">
        <nav className="w-48 shrink-0 space-y-1">
          {C_FILTERS.map((f) => {
            const count = p.items.filter((i) => match(i, f.key) && !i.read).length;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "flex w-full items-center rounded-md px-3 py-2 text-sm",
                  filter === f.key ? "bg-muted font-medium" : "hover:bg-muted/50"
                )}
              >
                {f.label}
                {count > 0 && f.key !== "archived" && (
                  <span className="ml-auto text-xs text-muted-foreground">{count}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="flex-1 rounded-lg border">
          <div className="flex h-11 items-center gap-2 border-b px-3 text-sm">
            {selected.size > 0 ? (
              <>
                <span className="text-muted-foreground">{selected.size} selected</span>
                <Button size="sm" variant="ghost" onClick={() => bulk(p.markRead)}>
                  <Check className="size-4" /> Mark read
                </Button>
                <Button size="sm" variant="ghost" onClick={() => bulk(p.markUnread)}>
                  <Undo2 className="size-4" /> Mark unread
                </Button>
                {filter === "archived" ? (
                  <Button size="sm" variant="ghost" onClick={() => bulk(p.unarchive)}>
                    <ReceiptText className="size-4" /> Unarchive
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => bulk(p.archive)}>
                    <Archive className="size-4" /> Archive
                  </Button>
                )}
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={p.markAllRead}>
                <CheckCheck className="size-4" /> Mark all read
              </Button>
            )}
          </div>
          {list.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {filter === "archived" ? "Nothing archived" : "No notifications here"}
            </div>
          ) : (
            list.map((i) => (
              <div
                key={i.id}
                className={cn(
                  "flex items-center gap-3 border-b px-3 py-2.5 text-sm last:border-b-0 hover:bg-muted/40",
                  !i.read && "font-semibold"
                )}
              >
                <input
                  type="checkbox"
                  checked={selected.has(i.id)}
                  onChange={() => toggle(i.id)}
                />
                <span
                  className={cn(
                    "w-36 shrink-0 rounded px-1.5 py-0.5 text-xs font-medium",
                    TYPE_META[i.type].tint
                  )}
                >
                  {TYPE_META[i.type].label}
                </span>
                <button
                  onClick={() => {
                    p.markRead(i.id);
                    p.go(i.url);
                  }}
                  className="min-w-0 flex-1 truncate text-left hover:underline"
                >
                  {i.body}
                </button>
                <span className="w-10 shrink-0 text-right text-xs font-normal text-muted-foreground">
                  {ago(i.minutesAgo)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- controls

const SEMANTICS: Record<string, string> = {
  A: "Badge = unseen count. Opening clears the badge (marks all seen). Click = read + navigate. ✕ = archive. No toasts.",
  B: "Badge = unread count. Opening changes nothing. Click = read + navigate. Hover: mark read/unread, archive. Toast on arrival.",
  C: "Badge = dot while anything is unseen. The 5 shown in the dropdown become read when it closes. Full inbox: filters + bulk actions.",
};

export function ProtoControls() {
  const p = useProto();
  const [expanded, setExpanded] = useState(false);
  const counts = useMemo(
    () => ({
      total: p.visible.length,
      unseen: p.visible.filter((i) => !i.seen).length,
      unread: p.visible.filter((i) => !i.read).length,
      archived: p.items.filter((i) => i.archived).length,
    }),
    [p.items]
  );
  if (import.meta.env.PROD) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      <div className="w-[560px] rounded-lg border-2 border-dashed border-fuchsia-500 bg-zinc-900/95 p-3 text-xs text-zinc-100 shadow-2xl">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-fuchsia-300">PROTOTYPE</span>
          <span>
            {counts.total} shown · {counts.unseen} unseen · {counts.unread} unread ·{" "}
            {counts.archived} archived
          </span>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="ml-auto underline"
          >
            {expanded ? "hide state" : "show state"}
          </button>
        </div>
        <p className="mt-1 text-zinc-400">{SEMANTICS[p.variant]}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ProtoBtn
            onClick={() => {
              const item = p.arrive();
              (window as any).__protoToast?.(item);
            }}
          >
            + Live arrival
          </ProtoBtn>
          <ProtoBtn onClick={p.empty}>Empty feed</ProtoBtn>
          <ProtoBtn onClick={p.reset}>Reset</ProtoBtn>
          <label className="ml-auto flex items-center gap-1">
            <input
              type="checkbox"
              checked={p.allTypes}
              onChange={(e) => p.setAllTypes(e.target.checked)}
            />
            All 6 types (ignore role)
          </label>
        </div>
        {expanded && (
          <table className="mt-2 w-full font-mono text-[11px]">
            <thead className="text-zinc-400">
              <tr>
                <th className="text-left">id</th>
                <th className="text-left">type</th>
                <th>seen</th>
                <th>read</th>
                <th>archived</th>
                <th className="text-right">age</th>
              </tr>
            </thead>
            <tbody>
              {p.items.map((i) => (
                <tr key={i.id}>
                  <td>{i.id}</td>
                  <td>{i.type}</td>
                  <td className="text-center">{i.seen ? "✓" : "·"}</td>
                  <td className="text-center">{i.read ? "✓" : "·"}</td>
                  <td className="text-center">{i.archived ? "✓" : "·"}</td>
                  <td className="text-right">{ago(i.minutesAgo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <PrototypeSwitcher variants={VARIANTS} current={p.variant} onChange={p.setVariant} />
    </div>
  );
}

function ProtoBtn({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded border border-zinc-600 px-2 py-0.5 hover:bg-zinc-700"
    >
      {children}
    </button>
  );
}
