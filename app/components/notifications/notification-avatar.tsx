import { UserAvatar } from "~/components/user-avatar";
import { cn } from "~/lib/utils";
import type { DescribedNotification } from "./describe-notification";

/** The actor's avatar with the kind's icon in the corner, or just the icon when nobody caused it. */
export function NotificationAvatar({
  notification,
  className,
}: {
  notification: DescribedNotification;
  className?: string;
}) {
  if (!notification.actor) {
    return (
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full bg-muted",
          notification.tone,
          className
        )}
      >
        {notification.icon}
      </div>
    );
  }

  return (
    <div className="relative shrink-0">
      <UserAvatar name={notification.actor} avatarUrl={null} className={className} />
      <span
        className={cn(
          "absolute -bottom-1 -right-1 flex rounded-full bg-popover p-0.5 [&_svg]:size-3",
          notification.tone
        )}
      >
        {notification.icon}
      </span>
    </div>
  );
}
