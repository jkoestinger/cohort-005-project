// PROTOTYPE: minimal headless client for Knock's feed API, talking straight
// from the browser with the public key + a server-signed user token.
// Polls instead of using Knock's realtime socket.
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface KnockFeedConfig {
  userId: string;
  userToken: string;
  publicApiKey: string;
  feedChannelId: string;
}

export interface FeedItem {
  id: string;
  inserted_at: string;
  seen_at: string | null;
  read_at: string | null;
  archived_at: string | null;
  data: Record<string, any> | null;
}

export interface FeedState {
  items: FeedItem[];
  unseenCount: number;
  unreadCount: number;
  totalCount: number;
  error: string | null;
  lastAction: string;
  markAs: (ids: string[], status: "seen" | "read" | "unread" | "archived") => Promise<void>;
  refresh: () => Promise<void>;
}

const API = "https://api.knock.app/v1";
const POLL_MS = 10_000;

const FeedContext = createContext<FeedState | null>(null);

export function useFeed() {
  const ctx = useContext(FeedContext);
  if (!ctx) throw new Error("useFeed outside KnockFeedProvider");
  return ctx;
}

export function KnockFeedProvider({
  config,
  children,
}: {
  config: KnockFeedConfig | null;
  children: React.ReactNode;
}) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [meta, setMeta] = useState({ unseen: 0, unread: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState("loaded");

  const headers = config
    ? {
        Authorization: `Bearer ${config.publicApiKey}`,
        "X-Knock-User-Token": config.userToken,
        "Content-Type": "application/json",
      }
    : undefined;

  const refresh = useCallback(async () => {
    if (!config || !headers) {
      setItems([]);
      setMeta({ unseen: 0, unread: 0, total: 0 });
      return;
    }
    const res = await fetch(
      `${API}/users/${config.userId}/feeds/${config.feedChannelId}?page_size=50`,
      { headers }
    );
    const body = await res.json();
    if (!res.ok) {
      setError(`${res.status} ${body.code ?? ""} ${body.message ?? ""}`);
      return;
    }
    setError(null);
    setItems(body.entries);
    setMeta({
      unseen: body.meta.unseen_count,
      unread: body.meta.unread_count,
      total: body.meta.total_count,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.userId, config?.userToken]);

  useEffect(() => {
    setItems([]);
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const markAs = useCallback<FeedState["markAs"]>(
    async (ids, status) => {
      if (!headers || ids.length === 0) return;
      setLastAction(`mark ${ids.length} as ${status}`);
      const res = await fetch(`${API}/messages/batch/${status}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ message_ids: ids }),
      });
      if (!res.ok) setError(`${res.status} marking ${status}`);
      await refresh();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refresh]
  );

  return (
    <FeedContext.Provider
      value={{
        items,
        unseenCount: meta.unseen,
        unreadCount: meta.unread,
        totalCount: meta.total,
        error,
        lastAction,
        markAs,
        refresh,
      }}
    >
      {children}
    </FeedContext.Provider>
  );
}
