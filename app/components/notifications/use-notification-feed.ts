import { useCallback, useEffect, useRef, useState } from "react";
import type { Feed, FeedItem } from "@knocklabs/client";
import { z } from "zod";
import type { FeedAuth } from "~/lib/notification-feed.server";

// ─── The Notification Feed in the browser ───
// Reads the signed-in person's Feed straight from Knock with @knocklabs/client
// (headless, real time over Knock's socket), authenticated with the user token
// the app layout's loader signed. The token is swapped for a fresh one from
// /api/notification-token a few minutes before it expires.

export type NotificationFeed = {
  /** False until the first page arrives, and if Knock rejects the token. */
  ready: boolean;
  items: FeedItem[];
  unseenCount: number;
  markAsRead: (item: FeedItem) => void;
  markAllAsSeen: () => void;
};

const REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000;

const tokenResponseSchema = z.object({ userToken: z.string() });

async function fetchFreshToken(): Promise<string | void> {
  const response = await fetch("/api/notification-token");
  if (!response.ok) return;
  const parsed = tokenResponseSchema.safeParse(await response.json());
  return parsed.success ? parsed.data.userToken : undefined;
}

export function useNotificationFeed(auth: FeedAuth | null): NotificationFeed {
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [unseenCount, setUnseenCount] = useState(0);
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
    setUnseenCount(0);
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
        page_size: 20,
      });
      feedRef.current = feed;

      const unsubscribe = feed.store.subscribe((state) => {
        setItems(state.items);
        setUnseenCount(state.metadata.unseen_count);
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

  const markAsRead = useCallback((item: FeedItem) => {
    if (!item.read_at) feedRef.current?.markAsRead(item);
  }, []);

  const markAllAsSeen = useCallback(() => {
    feedRef.current?.markAllAsSeen();
  }, []);

  return { ready, items, unseenCount, markAsRead, markAllAsSeen };
}
