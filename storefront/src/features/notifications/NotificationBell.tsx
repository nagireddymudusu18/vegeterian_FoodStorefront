"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { badgeLabel, notificationHref, timeAgo } from "./notifications";
import { useNotifications } from "./use-notifications";
import { useAuth } from "@/features/auth";

/** Bell with an unread badge and a dropdown of the latest messages. Renders nothing for signed-out visitors. */
export function NotificationBell({ tone = "light" }: { tone?: "light" | "dark" }) {
  const { status } = useAuth();
  const { unread, items, refresh, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    void refresh();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, refresh]);

  if (status !== "authed") return null;

  const badge = badgeLabel(unread);
  const button =
    tone === "dark" ? "rounded-lg px-3 py-2 text-sm hover:bg-white/15" : "rounded-lg px-2 py-2 hover:bg-stone-100";

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        className={`relative ${button}`}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">🔔</span>
        {badge && (
          <span
            className="absolute -right-0.5 -top-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-semibold text-white"
            aria-hidden="true"
          >
            {badge}
          </span>
        )}
      </button>
      {open && (
        <div
          role="region"
          aria-label="Notifications"
          className="absolute right-0 z-40 mt-2 w-[min(92vw,22rem)] rounded-xl border border-stone-200 bg-white text-stone-900 shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2">
            <h2 className="text-sm font-bold">Notifications</h2>
            {unread > 0 && (
              <button type="button" onClick={() => void markAllRead()} className="text-xs font-medium text-green-800 underline">
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-stone-600">Nothing yet. Order updates will show up here.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-stone-100 overflow-y-auto">
              {items.map((n) => {
                const href = notificationHref(n);
                const content = (
                  <>
                    <span className="flex items-start gap-2">
                      {!n.read && <span aria-label="Unread" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-green-600" />}
                      <span className="min-w-0">
                        <span className={`block text-sm ${n.read ? "text-stone-700" : "font-semibold"}`}>{n.title}</span>
                        <span className="block text-sm text-stone-600">{n.body}</span>
                        <span className="block text-xs text-stone-500">{timeAgo(n.createdAt)}</span>
                      </span>
                    </span>
                  </>
                );
                const onPick = () => {
                  if (!n.read) void markRead(n.id);
                  setOpen(false);
                };
                return (
                  <li key={n.id}>
                    {href ? (
                      <Link href={href} onClick={onPick} className="block px-4 py-3 hover:bg-stone-50">
                        {content}
                      </Link>
                    ) : (
                      <button type="button" onClick={onPick} className="block w-full px-4 py-3 text-left hover:bg-stone-50">
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-stone-200 px-4 py-2 text-center">
            <Link href="/notifications" onClick={() => setOpen(false)} className="text-sm font-medium text-green-800 underline">
              See all
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
