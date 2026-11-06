"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { orders, type Order } from "@/lib/api";
import { formatPaise } from "@/lib/money";
import {
  StatusPill,
  canCancel,
  computeCustomerOrderStats,
  filterCustomerOrders,
  isTerminal,
  type CustomerOrderFilterTab,
} from "@/features/orders";
import { useCart } from "@/features/cart";
import { useRequireAuth } from "@/features/auth";
import { Empty, ErrorBox, Spinner } from "@/components/ui";
import { RowsSkeleton } from "@/components/Skeletons";

export default function OrdersPage() {
  const router = useRouter();
  const auth = useRequireAuth();
  const { add, clear } = useCart();
  const authed = auth.status === "authed";
  const [list, setList] = useState<Order[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);
  const [tab, setTab] = useState<CustomerOrderFilterTab>("ALL");
  const [search, setSearch] = useState("");

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

  const stats = useMemo(() => computeCustomerOrderStats(list ?? []), [list]);
  const filtered = useMemo(() => filterCustomerOrders(list ?? [], tab, search), [list, tab, search]);

  const reorder = (o: Order) => {
    if (!o.restaurantId || !o.items?.length) return;
    clear();
    const rest = { id: o.restaurantId, name: o.restaurantName ?? "Restaurant" };
    for (const it of o.items) {
      if (!it.itemId) continue;
      const unitPaise = it.unitPricePaise ?? it.pricePaise ?? Math.round((it.linePaise ?? 0) / Math.max(1, it.quantity));
      for (let q = 0; q < it.quantity; q++) {
        add(rest, {
          itemId: it.itemId,
          name: it.name ?? "Item",
          pricePaise: unitPaise,
        });
      }
    }
    toast.success(`Loaded ${o.items.length} item(s) from ${o.restaurantName ?? "your past order"}`);
    router.push("/cart");
  };

  if (auth.status === "loading") return <RowsSkeleton label="Loading orders" />;
  if (!authed) {
    return (
      <div className="card mx-auto max-w-md space-y-3 p-6 text-center">
        <h1 className="text-xl font-bold text-ink">Sign in to view your orders</h1>
        <p className="text-sm text-stone-600">
          Sign in with your mobile OTP or email to view your order history, live kitchen tracking, and GST invoices, or track a single order by number.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link href="/login?next=/orders" className="btn-primary px-5 py-2.5 text-sm">
            Sign in
          </Link>
          <Link
            href="/track"
            className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 hover:bg-stone-100"
          >
            Track by order #
          </Link>
        </div>
      </div>
    );
  }
  if (error) return <ErrorBox error={error} onRetry={() => setNonce((n) => n + 1)} />;
  if (!list) return <RowsSkeleton label="Loading orders" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Your orders</h1>
          <p className="text-sm text-stone-600">
            Track live kitchen preparation, manage cancellations within the free window, or reorder past favourites.
          </p>
        </div>
        <Link
          href="/track"
          className="rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100 whitespace-nowrap shrink-0"
        >
          Lookup by order #
        </Link>
      </div>

      {list.length > 0 && (
        <>
          <section aria-label="Order summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="card p-3.5">
              <p className="text-xs font-medium text-stone-500">Total orders</p>
              <p className="mt-1 font-mono text-2xl font-extrabold tabular-nums text-stone-900">{stats.totalOrders}</p>
            </div>
            <div className="card p-3.5">
              <p className="text-xs font-medium text-stone-500">Active in progress</p>
              <p className="mt-1 font-mono text-2xl font-extrabold tabular-nums text-[#1B5E3A]">{stats.activeCount}</p>
            </div>
            <div className="card p-3.5">
              <p className="text-xs font-medium text-stone-500">Delivered</p>
              <p className="mt-1 font-mono text-2xl font-extrabold tabular-nums text-stone-900">{stats.deliveredCount}</p>
            </div>
            <div className="card p-3.5">
              <p className="text-xs font-medium text-stone-500">Refunded total</p>
              <p className="mt-1 font-mono text-2xl font-extrabold tabular-nums text-amber-900">
                {formatPaise(stats.refundedTotalPaise)}
              </p>
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              role="tablist"
              aria-label="Filter orders by status"
              className="flex flex-wrap items-center gap-1 rounded-xl bg-stone-200/75 p-1"
            >
              {(
                [
                  { id: "ALL", label: `All (${stats.totalOrders})` },
                  { id: "ACTIVE", label: `Active (${stats.activeCount})` },
                  { id: "DELIVERED", label: `Delivered (${stats.deliveredCount})` },
                  { id: "REFUNDED", label: `Cancelled & Refunded (${stats.cancelledOrRefundedCount})` },
                ] as const
              ).map((t) => {
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(t.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                      active ? "bg-white text-stone-900 shadow-xs" : "text-stone-700 hover:text-stone-900"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            <div className="min-w-56 flex-1 sm:max-w-xs">
              <input
                type="search"
                aria-label="Search orders by restaurant, dish, or order number"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search restaurant, dish, or #FA-..."
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900 placeholder:text-stone-400 focus:border-[#1B5E3A]"
              />
            </div>
          </div>
        </>
      )}

      {list.length === 0 ? (
        <Empty>
          <p className="mb-3">You have not placed any orders yet.</p>
          <Link href="/" className="font-medium text-green-800 underline">
            Browse restaurants
          </Link>
        </Empty>
      ) : filtered.length === 0 ? (
        <Empty>
          <p className="mb-2">No orders match the current filter.</p>
          <button
            type="button"
            onClick={() => {
              setTab("ALL");
              setSearch("");
            }}
            className="text-xs font-bold text-[#1B5E3A] underline"
          >
            Reset filter
          </button>
        </Empty>
      ) : (
        <ul className="space-y-3">
          {filtered.map((o) => {
            const activeOrder = !isTerminal(o.status);
            const cancellable = canCancel(o.status);
            const itemSummary = (o.items ?? [])
              .map((it) => `${it.quantity} × ${it.name ?? "Item"}`)
              .join(" · ");

            return (
              <li key={o.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/orders/${encodeURIComponent(o.id)}`}
                      className="font-bold leading-snug text-stone-900 hover:text-[#1B5E3A] hover:underline"
                    >
                      {o.restaurantName ?? "Order"}{" "}
                      <span className="whitespace-nowrap font-mono font-normal text-stone-500">
                        #{o.orderNumber ?? o.id.slice(0, 8)}
                      </span>
                    </Link>
                    <StatusPill status={o.status} />
                  </div>
                  {itemSummary && <p className="truncate text-xs font-medium text-stone-700">{itemSummary}</p>}
                  <p className="text-xs text-stone-500">
                    {o.createdAt ? new Date(o.createdAt).toLocaleString("en-IN") : ""}
                    {o.deliveryAddress ? ` · ${o.deliveryAddress}` : ""}
                  </p>
                  {o.status === "REFUNDED" && (
                    <p className="text-xs font-semibold text-green-800">
                      Instant refund processed ({formatPaise(o.totalPaise)})
                      {o.cancellationReason ? ` · Reason: ${o.cancellationReason}` : ""}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Link
                    href={`/orders/${encodeURIComponent(o.id)}`}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold whitespace-nowrap shrink-0 ${
                      activeOrder
                        ? "bg-[#1B5E3A] text-white hover:bg-green-800"
                        : "border border-stone-300 bg-white text-stone-800 hover:bg-stone-100"
                    }`}
                  >
                    {cancellable ? "Track / Cancel" : activeOrder ? "Track live" : "View receipt"}
                  </Link>
                  {o.restaurantId && o.items && o.items.length > 0 && (
                    <button
                      type="button"
                      onClick={() => reorder(o)}
                      className="rounded-xl border border-[#1B5E3A] bg-white px-3 py-1.5 text-xs font-bold text-[#1B5E3A] hover:bg-green-50 whitespace-nowrap shrink-0"
                    >
                      Order again
                    </button>
                  )}
                  <Link
                    href={`/orders/${encodeURIComponent(o.id)}`}
                    className="font-mono text-sm font-bold tabular-nums text-stone-900 hover:underline"
                  >
                    {formatPaise(o.totalPaise)}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
