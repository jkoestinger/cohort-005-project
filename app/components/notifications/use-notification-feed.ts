import { useCallback, useEffect, useRef, useState } from "react";
import type { Feed, FeedItem } from "@knocklabs/client";
import { z } from "zod";
import type { FeedAuth } from "~/lib/notification-feed.server";

// ─── The Notification Feed in the browser ───
// Reads the signed-in person's Feed straight from Knock with @knocklabs/client
// (headless, real time over Knock's socket), authenticated with the user token
// the app layout's loader signed. The token is swapped for a fresh one from
// /api/notification-token a few minutes before it expires.
// One connection per page: the layout opens it and shares it through
// NotificationFeedProvider, so the bell and /notifications see the same state.

export type NotificationFeed = {
  /** False until the first page arrives, and if Knock rejects the token. */
  ready: boolean;
  items: FeedItem[];
  unseenCount: number;
  unreadCount: number;
  totalCount: number;
  /** True while Knock has older Notifications than the loaded ones. */
  hasMore: boolean;
  loadMore: () => void;
  markAsRead: (item: FeedItem) => void;
  markAsUnread: (item: FeedItem) => void;
  markAllAsSeen: () => void;
  markAllAsRead: () => void;
};

const REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000;

const tokenResponseSchema = z.object({ userToken: z.string() });

async function fetchFreshToken(): Promise<string | void> {
  const response = await fetch("/api/notification-token");
  if (!response.ok) return;
  const parsed = tokenResponseSchema.safeParse(await response.json());
  return parsed.success ? parsed.data.userToken : undefined;
}

type FeedCounts = {
  unseenCount: number;
  unreadCount: number;
  totalCount: number;
  hasMore: boolean;
};

const NO_COUNTS: FeedCounts = {
  unseenCount: 0,
  unreadCount: 0,
  totalCount: 0,
  hasMore: false,
};

export function useNotificationFeed(auth: FeedAuth | null): NotificationFeed {
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [counts, setCounts] = useState<FeedCounts>(NO_COUNTS);
  const feedRef = useRef<Feed | null>(null);

  // The layout's loader signs a new token every time it runs. Only the first
  // one is needed: after that Knock asks for fresh ones itself. Reconnecting
  // happens when the person (or the Feed) changes, not when the token does.
  const tokenRef = useRef(auth?.userToken);

  const userId = auth?.userId;
  const publicApiKey = auth?.publicApiKey;
  const feedChannelId = auth?.feedChannelId;

  // A different person signed in: start from the token signed for them.
  // Declared before the connecting effect so it runs first.
  useEffect(() => {
    tokenRef.current = auth?.userToken;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    setReady(false);
    setItems([]);
    setCounts(NO_COUNTS);
    const userToken = tokenRef.current;
    if (!userId || !publicApiKey || !feedChannelId || !userToken) return;

    let disposed = false;
    let teardown = () => {};

    // Imported here so Knock's client (and its socket) never loads on the server.
    import("@knocklabs/client").then(({ default: Knock }) => {
      if (disposed) return;

      const knock = new Knock(publicApiKey);
      knock.authenticate({ id: userId }, userToken, {
        onUserTokenExpiring: fetchFreshToken,
        timeBeforeExpirationInMs: REFRESH_BEFORE_EXPIRY_MS,
        // Cadence names recipients when it triggers; the browser never writes users.
        identificationStrategy: "skip",
      });

      const feed = knock.feeds.initialize(feedChannelId, {
        archived: "exclude",
        page_size: 50,
      });
      feedRef.current = feed;

      const unsubscribe = feed.store.subscribe((state) => {
        setItems(state.items);
        setCounts({
          unseenCount: state.metadata.unseen_count,
          unreadCount: state.metadata.unread_count,
          totalCount: state.metadata.total_count,
          hasMore: Boolean(state.pageInfo.after),
        });
      });

      feed.listenForUpdates();
      feed.fetch().then((result) => {
        // A missing, expired or tampered token comes back as an error.
        if (!disposed) setReady(result?.status === "ok");
      });

      teardown = () => {
        unsubscribe();
        feed.dispose();
        knock.teardown();
        feedRef.current = null;
      };
    });

    return () => {
      disposed = true;
      teardown();
    };
  }, [userId, publicApiKey, feedChannelId]);

  const loadMore = useCallback(() => {
    feedRef.current?.fetchNextPage();
  }, []);

  const markAsRead = useCallback((item: FeedItem) => {
    if (!item.read_at) feedRef.current?.markAsRead(item);
  }, []);

  const markAsUnread = useCallback((item: FeedItem) => {
    if (item.read_at) feedRef.current?.markAsUnread(item);
  }, []);

  const markAllAsSeen = useCallback(() => {
    feedRef.current?.markAllAsSeen();
  }, []);

  const markAllAsRead = useCallback(() => {
    feedRef.current?.markAllAsRead();
  }, []);

  return {
    ready,
    items,
    ...counts,
    loadMore,
    markAsRead,
    markAsUnread,
    markAllAsSeen,
    markAllAsRead,
  };
}
