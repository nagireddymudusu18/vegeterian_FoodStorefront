"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { orders, type Order } from "@/lib/api";
import { formatPaise } from "@/lib/money";
import { StatusPill } from "@/features/orders";
import { useRequireAuth } from "@/features/auth";
import { Empty, ErrorBox, Spinner } from "@/components/ui";
import { RowsSkeleton } from "@/components/Skeletons";

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
  if (!list) return <RowsSkeleton label="Loading orders" />;

  return (
    <div className="space-y-5">
      <h1 className="page-title">Your orders</h1>
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
                className="card flex items-center justify-between gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="min-w-0">
                  <p className="font-bold leading-snug">
                    {o.restaurantName ?? "Order"} <span className="whitespace-nowrap font-normal text-stone-500">#{o.orderNumber ?? o.id.slice(0, 8)}</span>
                  </p>
                  {o.createdAt && <p className="text-sm text-stone-600">{new Date(o.createdAt).toLocaleString("en-IN")}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <p className="font-bold">{formatPaise(o.totalPaise)}</p>
                  <StatusPill status={o.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
