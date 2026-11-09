import { createContext, useContext, type ReactNode } from "react";
import type { FeedAuth } from "~/lib/notification-feed.server";
import { useNotificationFeed, type NotificationFeed } from "./use-notification-feed";

// ─── One Notification Feed for the whole app layout ───
// The bell and the /notifications page read the same connection, so marking a
// Notification read in one shows up in the other straight away.

const NotificationFeedContext = createContext<NotificationFeed | null>(null);

export function NotificationFeedProvider({
  auth,
  children,
}: {
  auth: FeedAuth | null;
  children: ReactNode;
}) {
  const feed = useNotificationFeed(auth);
  return (
    <NotificationFeedContext.Provider value={feed}>
      {children}
    </NotificationFeedContext.Provider>
  );
}

/** The signed-in person's Feed. Check `ready` before showing it. */
export function useFeed(): NotificationFeed {
  const feed = useContext(NotificationFeedContext);
  if (!feed) throw new Error("useFeed needs a NotificationFeedProvider above it");
  return feed;
}
