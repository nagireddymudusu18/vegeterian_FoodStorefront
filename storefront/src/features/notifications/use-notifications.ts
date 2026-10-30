"use client";

import { useCallback, useEffect, useState } from "react";
import { notificationsApi, type AppNotification } from "@/lib/api";
import { useAuth } from "@/features/auth";

const POLL_MS = 30_000;

/**
 * The signed-in user's inbox. The unread count is polled every 30 s while the tab is visible (and refreshed when
 * it becomes visible again); the list is fetched only when {@link UseNotifications.refresh} is called, for example
 * when the bell is opened. Errors are ignored on purpose: the bell must never get in the way of the page.
 */
export interface UseNotifications {
  unread: number;
  items: AppNotification[];
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export function useNotifications(limit = 20): UseNotifications {
  const { status } = useAuth();
  const authed = status === "authed";
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (!authed) {
      setUnread(0);
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    const poll = () => {
      if (document.visibilityState === "hidden") return;
      notificationsApi
        .unread(ctrl.signal)
        .then((r) => setUnread(r.unread))
        .catch(() => undefined);
    };
    poll();
    const timer = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      ctrl.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [authed]);

  const refresh = useCallback(async () => {
    try {
      const inbox = await notificationsApi.inbox(limit);
      setItems(inbox.items);
      setUnread(inbox.unread);
    } catch {
      // keep what is shown
    }
  }, [limit]);

  const markRead = useCallback(async (id: string) => {
    setItems((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnread((u) => Math.max(0, u - 1));
    try {
      await notificationsApi.markRead(id);
    } catch {
      // the next poll corrects the count
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setItems((list) => list.map((n) => ({ ...n, read: true })));
    setUnread(0);
    try {
      await notificationsApi.markAllRead();
    } catch {
      // the next poll corrects the count
    }
  }, []);

  return { unread, items, refresh, markRead, markAllRead };
}
