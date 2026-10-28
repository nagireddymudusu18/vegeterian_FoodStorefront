"use client";

import { useCallback, useEffect, useState } from "react";
import { staffOrders, type StaffOrder } from "@/lib/api";
import { formatPaise } from "@/lib/money";
import { useChangeStream } from "@/lib/use-change-stream";
import { Empty, ErrorBox, Spinner } from "@/components/ui";

// Changes arrive by push; the timer is only a safety net (fast while the stream is down).
const POLL_LIVE_MS = 60_000;
const POLL_DOWN_MS = 5000;

const LABEL: Record<string, string> = {
  PAID: "New order",
  MERCHANT_ACCEPTED: "Accepted",
  PREPARING: "Preparing",
  RIDER_ASSIGNED: "Rider assigned",
  PICKED_UP: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REJECTED_BY_MERCHANT: "Rejected",
  REFUNDED: "Refunded",
};

export default function RestaurantHome() {
  const [history, setHistory] = useState(false);
  const [list, setList] = useState<StaffOrder[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setList(await staffOrders.list(history));
    } catch (e) {
      setError(e);
    }
  }, [history]);

  const live = useChangeStream("/api/orders/orders/restaurant/stream", true, () => void refresh());
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), live ? POLL_LIVE_MS : POLL_DOWN_MS);
    return () => clearInterval(t);
  }, [refresh, live]);

  async function act(id: string, fn: (id: string) => Promise<unknown>) {
    setBusy(id);
    setError(null);
    try {
      await fn(id);
      await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  const btn = "rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60";
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">{history ? "Past orders" : "Live orders"}</h1>
        <span className="text-xs text-stone-500">{live ? "(live)" : "(updating every few seconds)"}</span>
        <button
          type="button"
          onClick={() => {
            setList(null);
            setHistory(!history);
          }}
          className="ml-auto rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-stone-300 hover:bg-stone-100"
        >
          {history ? "Show live orders" : "Show history"}
        </button>
      </div>
      {error != null && <ErrorBox error={error} />}
      {list === null ? (
        <Spinner label="Loading orders" />
      ) : list.length === 0 ? (
        <Empty>{history ? "No past orders." : "No active orders. New orders appear here instantly."}</Empty>
      ) : (
        <ul className="space-y-3">
          {list.map((o) => (
            <li key={o.id} className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">#{o.orderNumber}</span>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold">
                  {LABEL[o.status] ?? o.status}
                </span>
                {o.restaurantName && <span className="text-sm text-stone-600">{o.restaurantName}</span>}
                <span className="ml-auto font-semibold">{formatPaise(o.totalPaise)}</span>
              </div>
              <ul className="text-sm text-stone-800">
                {o.items.map((i, n) => (
                  <li key={n}>
                    {i.quantity} × {i.name}
                  </li>
                ))}
              </ul>
              {o.status === "PAID" && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy === o.id}
                    onClick={() => act(o.id, staffOrders.accept)}
                    className={`${btn} bg-emerald-700 hover:bg-emerald-800`}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={busy === o.id}
                    onClick={() => act(o.id, staffOrders.reject)}
                    className={`${btn} bg-red-700 hover:bg-red-800`}
                  >
                    Reject
                  </button>
                </div>
              )}
              {o.status === "MERCHANT_ACCEPTED" && (
                <button
                  type="button"
                  disabled={busy === o.id}
                  onClick={() => act(o.id, staffOrders.preparing)}
                  className={`${btn} bg-orange-700 hover:bg-orange-800`}
                >
                  Start preparing
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
