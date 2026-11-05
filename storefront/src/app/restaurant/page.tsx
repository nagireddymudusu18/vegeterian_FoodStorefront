"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth";
import { CertBadge } from "@/features/catalog";
import {
  computeOrderSla,
  filterKitchenOrders,
  summarizeKitchenBoard,
  type KitchenQueueStage,
} from "@/features/orders";
import {
  adminRestaurants,
  catalog,
  identity,
  staffOrders,
  type Restaurant,
  type StaffOrder,
} from "@/lib/api";
import { formatPaise } from "@/lib/money";
import { useChangeStream } from "@/lib/use-change-stream";
import { Empty, ErrorBox, Spinner } from "@/components/ui";

// Changes arrive by push; the timer is only a safety net (fast while the stream is down).
const POLL_LIVE_MS = 60_000;
const POLL_DOWN_MS = 5000;

const RADIUS_OPTIONS = [
  { meters: 3000, label: "3 km" },
  { meters: 4000, label: "4 km" },
  { meters: 5000, label: "5 km" },
  { meters: 6000, label: "6 km" },
  { meters: 8000, label: "8 km" },
  { meters: 10000, label: "10 km" },
];

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

const STAGE_TABS: { id: KitchenQueueStage; label: string }[] = [
  { id: "ALL", label: "All active" },
  { id: "NEW", label: "New" },
  { id: "ACCEPTED", label: "Accepted" },
  { id: "PREPARING", label: "Preparing" },
  { id: "DISPATCH", label: "Dispatch" },
];

export default function RestaurantHome() {
  const { me } = useAuth();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedOutletId, setSelectedOutletId] = useState<string>("ALL");
  const [storeBusy, setStoreBusy] = useState(false);

  const [history, setHistory] = useState(false);
  const [stage, setStage] = useState<KitchenQueueStage>("ALL");
  const [query, setQuery] = useState("");
  const [list, setList] = useState<StaffOrder[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    const isAdmin = identity.isAdmin(me);
    adminRestaurants
      .list()
      .then((all) => {
        const owned = isAdmin ? all : all.filter((r) => r.ownerUserId === me.id);
        setRestaurants(owned);
        if (owned.length === 1) {
          setSelectedOutletId(owned[0].id);
        }
      })
      .catch(setError);
  }, [me]);

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

  const activeOutlet = useMemo(() => {
    if (selectedOutletId === "ALL") return restaurants[0] ?? null;
    return restaurants.find((r) => r.id === selectedOutletId) ?? restaurants[0] ?? null;
  }, [restaurants, selectedOutletId]);

  const outletOrders = useMemo(() => {
    if (!list) return [];
    const outletName =
      selectedOutletId === "ALL"
        ? "ALL"
        : restaurants.find((r) => r.id === selectedOutletId)?.name ?? "ALL";
    return filterKitchenOrders(list, { restaurantName: outletName });
  }, [list, selectedOutletId, restaurants]);

  const summary = useMemo(() => summarizeKitchenBoard(outletOrders), [outletOrders]);

  const filteredOrders = useMemo(() => {
    return filterKitchenOrders(outletOrders, {
      stage: history ? "ALL" : stage,
      query,
    });
  }, [outletOrders, history, stage, query]);

  async function act(id: string, fn: (id: string) => Promise<unknown>, toastMsg: string) {
    setBusy(id);
    setError(null);
    try {
      await fn(id);
      toast.success(toastMsg);
      await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function toggleOutletOpen(r: Restaurant) {
    setStoreBusy(true);
    setError(null);
    try {
      const updated = await catalog.setRestaurantStatus(r.id, !r.open, r.deliveryRadiusMeters);
      setRestaurants((prev) => prev.map((x) => (x.id === r.id ? { ...x, open: updated.open } : x)));
      toast.success(updated.open ? `${r.name} is now accepting orders` : `${r.name} is paused for new orders`);
    } catch (e) {
      setError(e);
    } finally {
      setStoreBusy(false);
    }
  }

  async function updateOutletRadius(r: Restaurant, radiusMeters: number) {
    setStoreBusy(true);
    setError(null);
    try {
      const updated = await catalog.setRestaurantStatus(r.id, r.open, radiusMeters);
      setRestaurants((prev) =>
        prev.map((x) =>
          x.id === r.id ? { ...x, deliveryRadiusMeters: updated.deliveryRadiusMeters } : x,
        ),
      );
      toast.success(`Updated ${r.name} delivery radius to ${(radiusMeters / 1000).toFixed(0)} km`);
    } catch (e) {
      setError(e);
    } finally {
      setStoreBusy(false);
    }
  }

  const btn = "rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60";

  return (
    <div className="space-y-5">
      {/* Store Operations Control Bar */}
      {activeOutlet && (
        <section
          aria-label="Store operations"
          className="card flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-green-800 p-4"
        >
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {restaurants.length > 1 ? (
                <select
                  aria-label="Select kitchen outlet"
                  value={selectedOutletId}
                  onChange={(e) => setSelectedOutletId(e.target.value)}
                  className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm font-bold text-ink"
                >
                  <option value="ALL">All my outlets ({restaurants.length})</option>
                  {restaurants.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.open ? "Open" : "Paused"})
                    </option>
                  ))}
                </select>
              ) : (
                <h2 className="text-base font-extrabold text-ink">{activeOutlet.name}</h2>
              )}
              <CertBadge level={activeOutlet.kitchenCertificationLevel} />
              <span className="text-xs font-medium text-stone-500">
                FSSAI #{activeOutlet.fssaiNumber ?? "—"}
              </span>
            </div>
            <p className="text-xs text-stone-600">
              {selectedOutletId === "ALL" && restaurants.length > 1
                ? `Managing ${activeOutlet.name} store status below · Select a single outlet to filter tickets`
                : `Store controls for ${activeOutlet.name}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-stone-700">
              <span>Radius:</span>
              <select
                aria-label="Delivery radius"
                disabled={storeBusy}
                value={activeOutlet.deliveryRadiusMeters}
                onChange={(e) => void updateOutletRadius(activeOutlet, Number(e.target.value))}
                className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs font-bold text-ink"
              >
                {RADIUS_OPTIONS.map((opt) => (
                  <option key={opt.meters} value={opt.meters}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              role="switch"
              aria-checked={activeOutlet.open}
              disabled={storeBusy}
              onClick={() => void toggleOutletOpen(activeOutlet)}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                activeOutlet.open
                  ? "bg-green-800 text-white hover:bg-green-900"
                  : "bg-amber-100 text-amber-950 ring-1 ring-amber-400 hover:bg-amber-200"
              } disabled:opacity-60`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  activeOutlet.open ? "bg-emerald-300" : "bg-amber-600"
                }`}
              />
              {activeOutlet.open ? "Accepting orders" : "Kitchen paused"}
            </button>

            <Link
              href="/restaurant/menu"
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-800 hover:bg-stone-100"
            >
              Menu &amp; Availability &rarr;
            </Link>
          </div>
        </section>
      )}

      {/* KDS Header & Queue Mode Switch */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight">
              {history ? "Past kitchen orders" : "Live kitchen order board"}
            </h1>
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-200">
              {live ? "Live connected" : "Auto-updating"}
            </span>
          </div>
          <p className="text-xs text-stone-600">
            Accept incoming orders, start kitchen preparation, and hand off orders to assigned delivery partners.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setList(null);
            setHistory(!history);
          }}
          className="ml-auto rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-stone-800 ring-1 ring-stone-300 hover:bg-stone-100"
        >
          {history ? "Show live queue" : "Show order history"}
        </button>
      </div>

      {/* Live KDS KPI Cards */}
      {!history && list !== null && (
        <section aria-label="Kitchen metrics" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="card space-y-1 p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">New tickets</p>
            <p className="text-2xl font-extrabold tabular-nums text-emerald-800">{summary.newCount}</p>
            <p className="text-xs text-stone-600">Awaiting acceptance</p>
          </div>
          <div className="card space-y-1 p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">In kitchen prep</p>
            <p className="text-2xl font-extrabold tabular-nums text-amber-800">
              {summary.acceptedCount + summary.preparingCount}
            </p>
            <p className="text-xs text-stone-600">
              {summary.acceptedCount} accepted · {summary.preparingCount} cooking
            </p>
          </div>
          <div className="card space-y-1 p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Dispatch / rider</p>
            <p className="text-2xl font-extrabold tabular-nums text-ink">{summary.dispatchCount}</p>
            <p className="text-xs text-stone-600">Assigned or out for delivery</p>
          </div>
          <div className="card space-y-1 p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Queue value</p>
            <p className="text-2xl font-extrabold tabular-nums text-ink">
              {formatPaise(summary.totalRevenuePaise)}
            </p>
            <p className="text-xs text-stone-600">{summary.totalItemsCount} dish portions</p>
          </div>
        </section>
      )}

      {/* Stage Filter Tabs & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!history && (
          <div
            role="tablist"
            aria-label="Filter kitchen queue by stage"
            className="flex flex-wrap gap-1.5"
          >
            {STAGE_TABS.map((t) => {
              const count =
                t.id === "ALL"
                  ? summary.totalCount
                  : t.id === "NEW"
                    ? summary.newCount
                    : t.id === "ACCEPTED"
                      ? summary.acceptedCount
                      : t.id === "PREPARING"
                        ? summary.preparingCount
                        : summary.dispatchCount;
              const active = stage === t.id;
              return (
                <button
                  key={t.id}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => setStage(t.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    active
                      ? "bg-ink text-white shadow-sm"
                      : "bg-white text-stone-700 ring-1 ring-stone-300 hover:bg-stone-100"
                  }`}
                >
                  {t.label} ({count})
                </button>
              );
            })}
          </div>
        )}

        <div className="w-full sm:ml-auto sm:w-64">
          <input
            type="search"
            aria-label="Search kitchen orders"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search #order, dish, or note..."
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-sm focus:border-green-700"
          />
        </div>
      </div>

      {error != null && <ErrorBox error={error} />}

      {list === null ? (
        <Spinner label="Loading kitchen orders" />
      ) : filteredOrders.length === 0 ? (
        <Empty>
          {query.trim() || stage !== "ALL"
            ? "No kitchen tickets match the current filter."
            : history
              ? "No past orders yet."
              : "No active orders right now. New orders appear here instantly."}
        </Empty>
      ) : (
        <ul className="space-y-3">
          {filteredOrders.map((o) => {
            const sla = computeOrderSla(o.createdAt);
            const slaClass =
              sla.urgency === "OVERDUE"
                ? "bg-red-100 text-red-900 ring-1 ring-red-300"
                : sla.urgency === "AT_RISK"
                  ? "bg-amber-100 text-amber-950 ring-1 ring-amber-300"
                  : "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200";

            return (
              <li key={o.id} className="card space-y-3 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-base font-extrabold tracking-tight text-ink">
                    #{o.orderNumber}
                  </span>
                  <span className="rounded-md bg-stone-100 px-2.5 py-0.5 text-xs font-bold text-stone-800">
                    {LABEL[o.status] ?? o.status}
                  </span>
                  {!history && (
                    <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${slaClass}`}>
                      {sla.badgeLabel} · {sla.elapsedLabel}
                    </span>
                  )}
                  {o.restaurantName && (
                    <span className="text-xs font-semibold text-stone-600">{o.restaurantName}</span>
                  )}
                  <span className="ml-auto text-base font-extrabold tabular-nums text-ink">
                    {formatPaise(o.totalPaise)}
                  </span>
                </div>

                <ul className="divide-y divide-stone-100 rounded-xl bg-stone-50 px-3.5 py-2 text-sm text-stone-900">
                  {o.items.map((i, n) => (
                    <li key={n} className="flex items-center justify-between py-1 font-medium">
                      <span>{i.name}</span>
                      <span className="rounded bg-white px-2 py-0.5 font-mono text-xs font-bold text-stone-800 ring-1 ring-stone-200">
                        × {i.quantity}
                      </span>
                    </li>
                  ))}
                </ul>

                {o.cookingInstructions && (
                  <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">
                    Kitchen note: {o.cookingInstructions}
                  </p>
                )}

                {o.status === "PAID" && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busy === o.id}
                      onClick={() => act(o.id, staffOrders.accept, `Accepted order #${o.orderNumber}`)}
                      className={`${btn} bg-emerald-700 hover:bg-emerald-800`}
                    >
                      Accept order
                    </button>
                    <button
                      type="button"
                      disabled={busy === o.id}
                      onClick={() =>
                        act(o.id, staffOrders.reject, `Rejected order #${o.orderNumber} (refund triggered)`)
                      }
                      className={`${btn} bg-red-700 hover:bg-red-800`}
                    >
                      Reject
                    </button>
                  </div>
                )}

                {o.status === "MERCHANT_ACCEPTED" && (
                  <div className="pt-1">
                    <button
                      type="button"
                      disabled={busy === o.id}
                      onClick={() =>
                        act(o.id, staffOrders.preparing, `Order #${o.orderNumber} marked as preparing`)
                      }
                      className={`${btn} bg-amber-700 hover:bg-amber-800`}
                    >
                      Start preparing
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
