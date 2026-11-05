"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth";
import {
  estimateDeliveryPayoutPaise,
  filterRiderDeliveries,
  MAX_ACTIVE_DELIVERIES,
  resolveRiderStep,
  summarizeRiderShift,
} from "@/features/fleet";
import { fleetApi, refreshSession, type Delivery, type Partner } from "@/lib/api";
import { formatPaise } from "@/lib/money";
import { useChangeStream } from "@/lib/use-change-stream";
import { Empty, ErrorBox, Spinner } from "@/components/ui";

// Changes arrive by push; the timer is only a safety net (fast while the stream is down).
const POLL_LIVE_MS = 60_000;
const POLL_DOWN_MS = 4000;

const VEHICLE_OPTIONS = ["EV Scooter", "Bike", "Bicycle"];

type RiderTab = "dispatch" | "history";

export default function PartnerHome() {
  const { me, reload } = useAuth();
  const isPartner = !!me?.roles.includes("PARTNER");
  const [partner, setPartner] = useState<Partner | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      setPartner(await fleetApi.me());
    } catch (e) {
      if ((e as { status?: number }).status === 404) setPartner(null);
      else setError(e);
    }
  }, []);

  useEffect(() => {
    if (isPartner) void load();
  }, [isPartner, load]);

  if (!isPartner) {
    return (
      <Enroll
        onDone={async () => {
          // the PARTNER role only appears in a freshly issued token
          await refreshSession();
          await reload();
        }}
      />
    );
  }
  if (error) {
    return (
      <ErrorBox
        error={error}
        onRetry={() => {
          setError(null);
          void load();
        }}
      />
    );
  }
  if (partner === undefined) return <Spinner label="Loading fleet console" />;
  if (partner === null) return <Profile onDone={setPartner} />;
  return <Dashboard partner={partner} onPartner={setPartner} />;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`card space-y-3 p-5 ${className}`}>{children}</div>;
}

function Enroll({ onDone }: { onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      await fleetApi.becomePartner();
      toast.success("Enrolled as a Veggo Eats Delivery Partner");
      await onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <span className="inline-block rounded-md bg-haldi px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-green-900">
        Fleet Onboarding
      </span>
      <h1 className="text-2xl font-extrabold tracking-tight">Deliver with Veggo Eats</h1>
      <p className="text-sm text-stone-700">
        Activate your Delivery Partner profile to receive real-time pure-veg kitchen dispatches and earn per completed trip.
      </p>
      {error != null && <ErrorBox error={error} />}
      <button
        type="button"
        disabled={busy}
        onClick={go}
        className="rounded-lg bg-emerald-700 px-4 py-2.5 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {busy ? "Joining..." : "Become a delivery partner"}
      </button>
    </Card>
  );
}

function Profile({
  initialName = "",
  initialVehicle = "EV Scooter",
  onDone,
  onCancel,
}: {
  initialName?: string;
  initialVehicle?: string;
  onDone: (p: Partner) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [vehicle, setVehicle] = useState(initialVehicle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const updated = await fleetApi.register(name.trim(), vehicle.trim());
      toast.success("Saved delivery profile");
      onDone(updated);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  const input = "mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm";
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-extrabold tracking-tight">Your delivery profile</h2>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm font-semibold text-stone-600 underline">
            Cancel
          </button>
        )}
      </div>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm font-medium text-stone-800">
          Rider display name
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={input}
          />
        </label>
        <label className="block text-sm font-medium text-stone-800">
          Vehicle type
          <select value={vehicle} onChange={(e) => setVehicle(e.target.value)} className={input}>
            {VEHICLE_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        {error != null && <ErrorBox error={error} />}
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {busy ? "Saving..." : "Save profile"}
        </button>
      </form>
    </Card>
  );
}

function Dashboard({ partner, onPartner }: { partner: Partner; onPartner: (p: Partner) => void }) {
  const [pool, setPool] = useState<Delivery[]>([]);
  const [mine, setMine] = useState<Delivery[]>([]);
  const [historyList, setHistoryList] = useState<Delivery[]>([]);
  const [tab, setTab] = useState<RiderTab>("dispatch");
  const [poolQuery, setPoolQuery] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const online = partner.online;
  const onlineRef = useRef(online);
  onlineRef.current = online;

  const refresh = useCallback(async () => {
    try {
      // the partner may have just gone offline (409): then there is simply no pool
      const poolRequest = onlineRef.current
        ? fleetApi.pool().catch((e: { status?: number }) => {
            if (e?.status === 409) return [] as Delivery[];
            throw e;
          })
        : Promise.resolve([] as Delivery[]);
      const [m, h, p] = await Promise.all([
        fleetApi.mine(false),
        fleetApi.mine(true).catch(() => [] as Delivery[]),
        poolRequest,
      ]);
      setMine(m);
      setHistoryList(h);
      setPool(p);
      setError(null);
      onPartner(await fleetApi.me());
    } catch (e) {
      setError(e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const live = useChangeStream("/api/fleet/fleet/stream", true, () => void refresh());
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), live ? POLL_LIVE_MS : POLL_DOWN_MS);
    return () => clearInterval(t);
  }, [refresh, live, online]);

  const summary = useMemo(() => summarizeRiderShift(mine, historyList), [mine, historyList]);
  const filteredPool = useMemo(() => filterRiderDeliveries(pool, poolQuery), [pool, poolQuery]);

  async function run(key: string, fn: () => Promise<unknown>, toastMessage?: string, reload = true) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      if (toastMessage) toast.success(toastMessage);
      if (reload) await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Rider Shift Control Bar */}
      <Card className="border-l-4 border-l-emerald-700">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight">{partner.name}</h1>
              <span className="rounded-md bg-stone-100 px-2.5 py-0.5 text-xs font-bold text-stone-800">
                {partner.vehicle}
              </span>
              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-200">
                {mine.length} / {MAX_ACTIVE_DELIVERIES} active slots
              </span>
            </div>
            <p className="mt-0.5 text-xs text-stone-600">
              {online
                ? "Online and receiving real-time kitchen dispatch broadcasts"
                : "Offline — switch online to claim available deliveries"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditingProfile((prev) => !prev)}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-800 hover:bg-stone-100"
            >
              {editingProfile ? "Close profile" : "Edit vehicle"}
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={online}
              disabled={busy === "online"}
              onClick={() =>
                run(
                  "online",
                  async () => {
                    const next = await fleetApi.setOnline(!online);
                    onlineRef.current = next.online;
                    onPartner(next);
                  },
                  !online ? "You are now Online" : "You are now Offline",
                  false,
                )
              }
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold text-white transition ${
                online ? "bg-emerald-700 hover:bg-emerald-800" : "bg-stone-600 hover:bg-stone-700"
              } disabled:opacity-60`}
            >
              <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-300" : "bg-stone-300"}`} />
              {online ? "Online" : "Offline"}
            </button>
          </div>
        </div>
      </Card>

      {editingProfile && (
        <Profile
          initialName={partner.name}
          initialVehicle={partner.vehicle}
          onDone={(updated) => {
            onPartner(updated);
            setEditingProfile(false);
          }}
          onCancel={() => setEditingProfile(false)}
        />
      )}

      {/* Shift KPI Cards */}
      <section aria-label="Shift summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card space-y-1 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Active jobs</p>
          <p className="text-2xl font-extrabold tabular-nums text-ink">
            {summary.activeCount} / {MAX_ACTIVE_DELIVERIES}
          </p>
          <p className="text-xs text-stone-600">
            {summary.assignedCount} pickup · {summary.pickedUpCount} drop-off
          </p>
        </div>
        <div className="card space-y-1 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Open pool</p>
          <p className="text-2xl font-extrabold tabular-nums text-emerald-800">{pool.length}</p>
          <p className="text-xs text-stone-600">{online ? "Ready to claim" : "Go online to view"}</p>
        </div>
        <div className="card space-y-1 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Completed trips</p>
          <p className="text-2xl font-extrabold tabular-nums text-ink">{summary.completedCount}</p>
          <p className="text-xs text-stone-600">OTP verified handoffs</p>
        </div>
        <div className="card space-y-1 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Shift earnings</p>
          <p className="text-2xl font-extrabold tabular-nums text-emerald-800">
            {formatPaise(summary.completedEarningsPaise)}
          </p>
          <p className="text-xs text-stone-600">
            +{formatPaise(summary.activePotentialPaise)} in active queue
          </p>
        </div>
      </section>

      {/* Portal View Switcher */}
      <div
        role="tablist"
        aria-label="Delivery portal views"
        className="flex flex-wrap gap-2 border-b border-stone-200 pb-3"
      >
        <button
          role="tab"
          type="button"
          aria-selected={tab === "dispatch"}
          onClick={() => setTab("dispatch")}
          className={`rounded-lg px-3.5 py-2 text-xs font-bold transition ${
            tab === "dispatch"
              ? "bg-ink text-white shadow-sm"
              : "bg-white text-stone-700 ring-1 ring-stone-300 hover:bg-stone-100"
          }`}
        >
          Active &amp; Dispatch Pool ({mine.length + pool.length})
        </button>
        <button
          role="tab"
          type="button"
          aria-selected={tab === "history"}
          onClick={() => setTab("history")}
          className={`rounded-lg px-3.5 py-2 text-xs font-bold transition ${
            tab === "history"
              ? "bg-ink text-white shadow-sm"
              : "bg-white text-stone-700 ring-1 ring-stone-300 hover:bg-stone-100"
          }`}
        >
          Completed Trips &amp; Earnings ({summary.completedCount})
        </button>
      </div>

      {error != null && <ErrorBox error={error} />}

      {tab === "dispatch" ? (
        <div className="space-y-6">
          <section aria-labelledby="mine" className="space-y-3">
            <h2 id="mine" className="text-lg font-bold">
              My active deliveries ({mine.length})
            </h2>
            {mine.length === 0 ? (
              <Empty>No active deliveries. Claim an order from the pool below to start a trip.</Empty>
            ) : (
              mine.map((d) => <ActiveJob key={d.orderId} d={d} busy={busy} run={run} />)
            )}
          </section>

          <section aria-labelledby="pool" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="pool" className="text-lg font-bold">
                Available orders in pool ({filteredPool.length})
              </h2>
              {online && pool.length > 0 && (
                <input
                  type="search"
                  aria-label="Search delivery pool"
                  value={poolQuery}
                  onChange={(e) => setPoolQuery(e.target.value)}
                  placeholder="Filter by #order, kitchen, or area..."
                  className="w-full rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-sm sm:w-64"
                />
              )}
            </div>

            {!online ? (
              <Empty>Go online using the switch above to see available orders.</Empty>
            ) : filteredPool.length === 0 ? (
              <Empty>
                {poolQuery.trim()
                  ? "No pool orders match your filter."
                  : "Nothing waiting right now. This list refreshes automatically."}
              </Empty>
            ) : (
              filteredPool.map((d) => {
                const payout = estimateDeliveryPayoutPaise(d);
                return (
                  <Card key={d.orderId}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-base font-extrabold text-ink">
                            #{d.orderNumber}
                          </span>
                          <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-900 ring-1 ring-emerald-200">
                            Est. payout {formatPaise(payout)}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-stone-800">
                          Pickup: {d.restaurantName ?? "Veggo Eats Kitchen"}
                        </p>
                        {d.deliveryAddress && (
                          <p className="text-xs text-stone-600">Drop-off: {d.deliveryAddress}</p>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={busy === d.orderId || summary.atCapacity}
                        onClick={() =>
                          run(
                            d.orderId,
                            () => fleetApi.accept(d.orderId),
                            `Claimed delivery #${d.orderNumber}`,
                          )
                        }
                        className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                      >
                        {summary.atCapacity ? "At 2-order limit" : "Accept delivery"}
                      </button>
                    </div>
                  </Card>
                );
              })
            )}
          </section>
        </div>
      ) : (
        <section aria-labelledby="history-heading" className="space-y-3">
          <h2 id="history-heading" className="text-lg font-bold">
            Completed trips &amp; earnings
          </h2>
          {historyList.length === 0 ? (
            <Empty>No completed trips yet. Completed handoffs appear here with your trip payout.</Empty>
          ) : (
            <ul className="space-y-3">
              {historyList.map((d) => {
                const payout = estimateDeliveryPayoutPaise(d);
                return (
                  <li key={d.orderId} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-extrabold text-ink">#{d.orderNumber}</span>
                        <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-900 ring-1 ring-emerald-200">
                          {d.status}
                        </span>
                        <span className="text-sm font-bold text-stone-800">
                          {d.restaurantName ?? "Restaurant"}
                        </span>
                      </div>
                      {d.deliveryAddress && (
                        <p className="text-xs text-stone-600">Delivered to: {d.deliveryAddress}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-base font-extrabold tabular-nums text-emerald-800">
                        +{formatPaise(payout)}
                      </p>
                      <p className="text-xs text-stone-500">Trip payout</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function ActiveJob({
  d,
  busy,
  run,
}: {
  d: Delivery;
  busy: string | null;
  run: (key: string, fn: () => Promise<unknown>, toastMessage?: string) => Promise<void>;
}) {
  const [otp, setOtp] = useState("");
  const step = resolveRiderStep(d.status);
  const payout = estimateDeliveryPayoutPaise(d);
  const btn = "rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60";

  return (
    <Card className="border-l-4 border-l-amber-600">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-base font-extrabold text-ink">#{d.orderNumber}</span>
          <span className="rounded-md bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-950">
            {d.status === "ASSIGNED" ? "Pickup at kitchen" : "Out for delivery"}
          </span>
        </div>
        <span className="text-sm font-extrabold tabular-nums text-emerald-800">
          Payout: {formatPaise(payout)}
        </span>
      </div>

      {/* 2-Step Progress Indicator */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div
          className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
            step.stepNumber === 1
              ? "bg-ink text-white"
              : "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200"
          }`}
        >
          1. Pick up at {d.restaurantName ?? "Kitchen"}
        </div>
        <div
          className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
            step.stepNumber === 2
              ? "bg-ink text-white"
              : "bg-stone-100 text-stone-600"
          }`}
        >
          2. Verify Customer OTP at drop-off
        </div>
      </div>

      <div className="rounded-xl bg-stone-50 p-3 text-xs text-stone-700 space-y-1">
        <p className="font-bold text-stone-900">{step.headline}</p>
        <p>{step.instruction}</p>
        {d.deliveryAddress && (
          <p className="pt-1 font-semibold text-ink">Drop-off address: {d.deliveryAddress}</p>
        )}
      </div>

      {d.status === "ASSIGNED" && (
        <button
          type="button"
          disabled={busy === d.orderId}
          onClick={() =>
            run(
              d.orderId,
              () => fleetApi.pickedUp(d.orderId),
              `Picked up order #${d.orderNumber} from ${d.restaurantName ?? "kitchen"}`,
            )
          }
          className={btn}
        >
          Picked up from kitchen
        </button>
      )}

      {d.status === "PICKED_UP" && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              d.orderId,
              () => fleetApi.deliver(d.orderId, otp.trim()).then(() => setOtp("")),
              `Order #${d.orderNumber} delivered! Payout credited.`,
            );
          }}
        >
          <input
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            aria-label="Customer delivery OTP"
            placeholder="4-digit Customer OTP"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            className="w-44 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-mono tracking-widest"
          />
          <button type="submit" disabled={busy === d.orderId || !otp.trim()} className={btn}>
            Verify OTP &amp; Mark Delivered
          </button>
        </form>
      )}
    </Card>
  );
}
