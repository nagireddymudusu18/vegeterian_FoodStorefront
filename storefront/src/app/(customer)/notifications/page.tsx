"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { notificationsApi, type Inbox } from "@/lib/api";
import { useRequireAuth } from "@/features/auth";
import { notificationHref, timeAgo } from "@/features/notifications";
import { Empty, ErrorBox, Spinner } from "@/components/ui";

export default function NotificationsPage() {
  const auth = useRequireAuth();
  const authed = auth.status === "authed";
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!authed) return;
    const ctrl = new AbortController();
    setError(null);
    notificationsApi
      .inbox(100, ctrl.signal)
      .then(setInbox)
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e);
      });
    return () => ctrl.abort();
  }, [authed, nonce]);

  async function markAll() {
    await notificationsApi.markAllRead().catch(() => undefined);
    setNonce((n) => n + 1);
  }

  async function open(id: string, read: boolean) {
    if (!read) await notificationsApi.markRead(id).catch(() => undefined);
  }

  if (!authed) return <Spinner label="Loading notifications" />;
  if (error) return <ErrorBox error={error} onRetry={() => setNonce((n) => n + 1)} />;
  if (!inbox) return <Spinner label="Loading notifications" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Notifications</h1>
        {inbox.unread > 0 && (
          <button
            type="button"
            onClick={() => void markAll()}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100"
          >
            Mark all read
          </button>
        )}
      </div>
      {inbox.items.length === 0 ? (
        <Empty>Nothing yet. Order updates will show up here.</Empty>
      ) : (
        <ul className="space-y-2">
          {inbox.items.map((n) => {
            const href = notificationHref(n);
            const card = (
              <div className={`rounded-xl border p-4 ${n.read ? "border-stone-200 bg-white" : "border-green-300 bg-green-50"}`}>
                <p className={n.read ? "font-medium" : "font-semibold"}>{n.title}</p>
                <p className="text-sm text-stone-700">{n.body}</p>
                <p className="mt-1 text-xs text-stone-500">{timeAgo(n.createdAt)}</p>
              </div>
            );
            return (
              <li key={n.id}>
                {href ? (
                  <Link href={href} onClick={() => void open(n.id, n.read)} className="block hover:shadow-md">
                    {card}
                  </Link>
                ) : (
                  card
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
