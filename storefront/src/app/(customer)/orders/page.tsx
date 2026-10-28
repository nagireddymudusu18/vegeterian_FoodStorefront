"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { orders, type Order } from "@/lib/api";
import { formatPaise } from "@/lib/money";
import { isFailure, statusLabel } from "@/features/orders";
import { useRequireAuth } from "@/features/auth";
import { Empty, ErrorBox, Spinner } from "@/components/ui";

export default function OrdersPage() {
  const auth = useRequireAuth();
  const authed = auth.status === "authed";
  const [list, setList] = useState<Order[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!authed) return;
    const ctrl = new AbortController();
    setError(null);
    orders
      .list(ctrl.signal)
      .then((l) => setList([...l].sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))))
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e);
      });
    return () => ctrl.abort();
  }, [authed, nonce]);

  if (!authed) return <Spinner label="Loading orders" />;
  if (error) return <ErrorBox error={error} onRetry={() => setNonce((n) => n + 1)} />;
  if (!list) return <Spinner label="Loading orders" />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Your orders</h1>
      {list.length === 0 ? (
        <Empty>
          <p className="mb-3">You have not placed any orders yet.</p>
          <Link href="/" className="font-medium text-green-800 underline">
            Browse restaurants
          </Link>
        </Empty>
      ) : (
        <ul className="space-y-3">
          {list.map((o) => (
            <li key={o.id}>
              <Link
                href={`/orders/${encodeURIComponent(o.id)}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-4 hover:shadow-md"
              >
                <div>
                  <p className="font-semibold">
                    {o.restaurantName ?? "Order"} <span className="font-normal text-stone-500">#{o.orderNumber ?? o.id.slice(0, 8)}</span>
                  </p>
                  {o.createdAt && <p className="text-sm text-stone-600">{new Date(o.createdAt).toLocaleString("en-IN")}</p>}
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatPaise(o.totalPaise)}</p>
                  <p className={`text-sm ${isFailure(o.status) ? "text-red-700" : "text-green-800"}`}>{statusLabel(o.status)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
