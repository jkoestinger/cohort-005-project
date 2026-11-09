import { cn } from "~/lib/utils";

/** The dot on an unread Notification's row. */
export function UnreadDot({ className }: { className?: string }) {
  return (
    <span
      aria-label="Unread"
      className={cn("size-2 shrink-0 rounded-full bg-primary", className)}
    />
  );
}
