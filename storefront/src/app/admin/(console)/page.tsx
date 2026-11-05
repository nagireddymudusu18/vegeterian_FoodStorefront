"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  adminRestaurants,
  deadLettersApi,
  errorMessage,
  flagsApi,
  fleetApi,
  staffOrders,
  type AdminFlag,
  type Delivery,
  type Partner,
  type Restaurant,
  type StaffOrder,
} from "@/lib/api";
import { computePlatformOpsSummary } from "@/features/admin";
import { StatusPill } from "@/features/orders";
import { formatPaise } from "@/lib/money";
import { ErrorBox, Spinner } from "@/components/ui";

const SERVICES = ["orders", "payments", "fleet", "notifications"] as const;

function Tile({
  href,
  label,
  children,
  action,
  alert,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
  action: string;
  alert?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-2xl bg-white p-5 shadow-sm ring-1 transition-shadow hover:ring-green-600 ${
        alert ? "ring-red-400" : "ring-stone-200"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</p>
      <div className="mt-1.5">{children}</div>
      <p className="mt-2.5 text-xs font-bold text-[#1B5E3A]">{action} &rarr;</p>
    </Link>
  );
}

export default function AdminDashboard() {
  const [flags, setFlags] = useState<AdminFlag[] | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[] | null>(null);
  const [activeOrders, setActiveOrders] = useState<StaffOrder[] | null>(null);
  const [historyOrders, setHistoryOrders] = useState<StaffOrder[] | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null);
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [parked, setParked] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<number | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const f = await flagsApi.list();
      setFlags(f);
    } catch (e) {
      setError(e);
      return;
    }

    const [restRes, activeOrdRes, histOrdRes, delRes, partRes, ...deadRes] = await Promise.allSettled([
      adminRestaurants.list(),
      staffOrders.list(false),
      staffOrders.list(true),
      fleetApi.admin.deliveries(),
      fleetApi.admin.partners(),
      ...SERVICES.map((s) => deadLettersApi.list(s)),
    ]);

    setRestaurants(restRes.status === "fulfilled" ? restRes.value : null);
    setActiveOrders(activeOrdRes.status === "fulfilled" ? activeOrdRes.value : null);
    setHistoryOrders(histOrdRes.status === "fulfilled" ? histOrdRes.value : null);
    setDeliveries(delRes.status === "fulfilled" ? delRes.value : null);
    setPartners(partRes.status === "fulfilled" ? partRes.value : null);

    const counts = deadRes.map((d) => (d.status === "fulfilled" ? d.value.open : null));
    setParked(counts.some((c) => c === null) ? null : counts.reduce<number>((a, c) => a + (c ?? 0), 0));
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function handleBackfillContacts() {
    setBackfilling(true);
    try {
      const res = await flagsApi.backfillContacts();
      setBackfillResult(res.published);
      toast.success(`Published ${res.published} verified user contact event${res.published === 1 ? "" : "s"} to outbox.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBackfilling(false);
    }
  }

  if (error) return <ErrorBox error={error} />;
  if (!flags) return <Spinner label="Loading dashboard" />;

  const ops = computePlatformOpsSummary({
    restaurants,
    activeOrders,
    historyOrders,
    deliveries,
    partners,
    parkedDeadLetters: parked,
    flags,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-stone-900">Marketplace Operations</h1>
          <p className="text-sm text-stone-600">
            Real-time marketplace oversight across customer orders, certified kitchens, delivery fleet, feature flags, and team access.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadAll()}
          className="rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-bold text-stone-800 hover:bg-stone-100 whitespace-nowrap shrink-0"
        >
          Refresh metrics
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile href="/admin/deliveries" label="Live orders & GMV" action="Inspect dispatch & orders">
          <p className="font-mono text-3xl font-extrabold tabular-nums text-stone-900">
            {activeOrders ? ops.liveOrdersCount : "-"}{" "}
            <span className="font-sans text-sm font-medium text-stone-500">
              active · {historyOrders ? ops.deliveredOrdersCount : "-"} delivered
            </span>
          </p>
          <p className="mt-1 font-mono text-xs font-semibold tabular-nums text-stone-600">
            Processed GMV: {formatPaise(ops.grossMerchandiseValuePaise)}
          </p>
        </Tile>

        <Tile href="/admin/restaurants" label="Certified kitchens" action="Onboard & link owners">
          <p className="font-mono text-3xl font-extrabold tabular-nums text-stone-900">
            {restaurants ? `${ops.openKitchensCount} / ${ops.totalKitchensCount}` : "-"}{" "}
            <span className="font-sans text-sm font-medium text-stone-500">open</span>
          </p>
          {restaurants && ops.unlinkedKitchensCount > 0 ? (
            <p className="mt-1 text-xs font-semibold text-amber-800">
              {ops.unlinkedKitchensCount} kitchen{ops.unlinkedKitchensCount === 1 ? "" : "s"} without an owner
            </p>
          ) : (
            <p className="mt-1 text-xs text-stone-600">All kitchens linked to partner accounts</p>
          )}
        </Tile>

        <Tile href="/admin/deliveries" label="Fleet & rider dispatch" action="Assign riders manually">
          <p className="font-mono text-3xl font-extrabold tabular-nums text-stone-900">
            {partners ? ops.onlineRidersCount : "-"}{" "}
            <span className="font-sans text-sm font-medium text-stone-500">
              online · {deliveries ? ops.unassignedDeliveriesCount : "-"} unassigned
            </span>
          </p>
          <p className="mt-1 text-xs text-stone-600">
            {deliveries ? `${ops.inTransitDeliveriesCount} in transit` : "Checking fleet status"}
          </p>
        </Tile>

        <Tile href="/admin/flags" label="Feature flags" action="Manage runtime flags">
          <p className="font-mono text-3xl font-extrabold tabular-nums text-stone-900">
            {ops.enabledFlagsCount}{" "}
            <span className="font-sans text-base font-medium text-stone-500">of {ops.totalFlagsCount} on</span>
          </p>
          <p className="mt-1 text-xs text-stone-600">Controls OTP, tracking, SSE &amp; dispatch</p>
        </Tile>

        <Tile href="/admin/dead-letters" label="Event queue" action="Review failed events" alert={!!parked}>
          <p className="font-mono text-3xl font-extrabold tabular-nums text-stone-900">
            {parked ?? "-"} <span className="font-sans text-base font-medium text-stone-500">queued</span>
          </p>
          <p className="mt-1 text-xs text-stone-600">Async event health across orders, payments, fleet &amp; notifications</p>
        </Tile>

        <Tile href="/admin/team" label="Users & Access Control" action="Manage portal roles & team">
          <p className="text-base font-extrabold text-stone-900">4 Portal Roles</p>
          <p className="mt-1 text-xs text-stone-600">
            Manage Customer, Kitchen Partner, Delivery Partner, and Admin permissions.
          </p>
        </Tile>
      </div>

      <section aria-labelledby="live-orders-h" className="card space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="live-orders-h" className="text-base font-extrabold text-stone-900">
              Live Marketplace Order Queue ({activeOrders?.length ?? 0})
            </h2>
            <p className="text-xs text-stone-600">
              Active orders currently being prepared by partner kitchens or in transit with delivery partners.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/deliveries"
              className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-800 hover:bg-stone-100 whitespace-nowrap shrink-0"
            >
              Fleet dispatch &rarr;
            </Link>
            <Link
              href="/admin/refunds"
              className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-800 hover:bg-stone-100 whitespace-nowrap shrink-0"
            >
              Manual refunds &rarr;
            </Link>
          </div>
        </div>

        {!activeOrders ? (
          <p className="text-xs text-stone-500">Loading active marketplace orders...</p>
        ) : activeOrders.length === 0 ? (
          <p className="rounded-xl bg-stone-50 p-4 text-xs text-stone-600">
            No active orders in progress right now. All recent orders have reached a terminal state.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stone-200 text-xs font-bold uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="py-2.5 pr-3">Order #</th>
                  <th className="py-2.5 px-3">Kitchen</th>
                  <th className="py-2.5 px-3">Items</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 pl-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {activeOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-stone-50/80">
                    <td className="py-2.5 pr-3 font-mono text-xs font-bold text-stone-900">#{o.orderNumber}</td>
                    <td className="py-2.5 px-3 font-semibold text-stone-800">{o.restaurantName ?? "Kitchen"}</td>
                    <td className="py-2.5 px-3 text-xs text-stone-600">
                      {o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusPill status={o.status} />
                    </td>
                    <td className="py-2.5 pl-3 text-right font-mono text-xs font-bold tabular-nums text-stone-900">
                      {formatPaise(o.totalPaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col justify-between rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Dispute &amp; Payment Oversight</p>
            <h2 className="mt-1 text-base font-extrabold text-stone-900">Manual Refunds &amp; Settlement Lookup</h2>
            <p className="mt-1 text-xs text-stone-600">
              Cancelled or rejected orders are refunded automatically. Inspect captured payments by Order # or Payment ID to issue guarded partial or full manual refunds.
            </p>
          </div>
          <div className="mt-3">
            <Link
              href="/admin/refunds"
              className="inline-block rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-xs font-bold text-stone-800 hover:bg-stone-100"
            >
              Open manual refunds tool &rarr;
            </Link>
          </div>
        </div>

        {/* Customer Contact Directory Sync */}
        <div className="flex flex-col justify-between rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Notification Directory</p>
            <h2 className="mt-1 text-base font-extrabold text-stone-900">Customer Contact Sync</h2>
            <p className="mt-1 text-xs text-stone-600">
              Sync verified customer phone numbers and email addresses with the notification service.
            </p>
            {backfillResult !== null && (
              <p className="mt-1.5 text-xs font-semibold text-green-800">
                Last sync: {backfillResult} verified account{backfillResult === 1 ? "" : "s"} queued.
              </p>
            )}
          </div>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => void handleBackfillContacts()}
              disabled={backfilling}
              className="rounded-lg bg-green-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-green-800 disabled:opacity-50"
            >
              {backfilling ? "Syncing..." : "Sync verified contacts"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
