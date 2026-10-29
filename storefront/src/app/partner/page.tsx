"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fleetApi, refreshSession, type Delivery, type Partner } from "@/lib/api";
import { useAuth } from "@/features/auth";
import { useChangeStream } from "@/lib/use-change-stream";
import { Empty, ErrorBox, Spinner } from "@/components/ui";

// Changes arrive by push; the timer is only a safety net (fast while the stream is down).
const POLL_LIVE_MS = 60_000;
const POLL_DOWN_MS = 4000;

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
  if (error) return <ErrorBox error={error} onRetry={() => { setError(null); void load(); }} />;
  if (partner === undefined) return <Spinner label="Loading" />;
  if (partner === null) return <Profile onDone={setPartner} />;
  return <Dashboard partner={partner} onPartner={setPartner} />;
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200">{children}</div>;
}

function Enroll({ onDone }: { onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      await fleetApi.becomePartner();
      await onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <h1 className="text-xl font-bold">Deliver with Veggo Eats</h1>
      <p className="text-sm text-stone-700">
        Your account needs a verified phone number. Sign in with your phone and OTP, then join as a delivery partner.
      </p>
      {error != null && <ErrorBox error={error} />}
      <button
        type="button"
        disabled={busy}
        onClick={go}
        className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {busy ? "Joining..." : "Become a delivery partner"}
      </button>
    </Card>
  );
}

function Profile({ onDone }: { onDone: (p: Partner) => void }) {
  const [name, setName] = useState("");
  const [vehicle, setVehicle] = useState("Bike");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await fleetApi.register(name.trim(), vehicle.trim()));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  const input = "w-full rounded-lg border border-stone-300 px-3 py-2";
  return (
    <Card>
      <h1 className="text-xl font-bold">Your delivery profile</h1>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm font-medium">
          Name
          <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className={input} />
        </label>
        <label className="block text-sm font-medium">
          Vehicle
          <input required maxLength={40} value={vehicle} onChange={(e) => setVehicle(e.target.value)} className={input} />
        </label>
        {error != null && <ErrorBox error={error} />}
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          Save
        </button>
      </form>
    </Card>
  );
}

function Dashboard({ partner, onPartner }: { partner: Partner; onPartner: (p: Partner) => void }) {
  const [pool, setPool] = useState<Delivery[]>([]);
  const [mine, setMine] = useState<Delivery[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const online = partner.online;
  const onlineRef = useRef(online);
  onlineRef.current = online;

  const refresh = useCallback(async () => {
    try {
      const [m, p] = await Promise.all([fleetApi.mine(), onlineRef.current ? fleetApi.pool() : Promise.resolve([])]);
      setMine(m);
      setPool(p);
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
  }, [refresh, live]);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold">{partner.name}</h1>
            <p className="text-sm text-stone-600">
              {partner.vehicle} · {partner.activeDeliveries} active
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={online}
            disabled={busy === "online"}
            onClick={() => run("online", async () => onPartner(await fleetApi.setOnline(!online)))}
            className={`ml-auto rounded-full px-4 py-2 text-sm font-semibold text-white ${
              online ? "bg-emerald-700" : "bg-stone-500"
            }`}
          >
            {online ? "Online" : "Offline"}
          </button>
        </div>
      </Card>

      {error != null && <ErrorBox error={error} />}

      <section aria-labelledby="mine" className="space-y-3">
        <h2 id="mine" className="text-lg font-bold">
          My deliveries
        </h2>
        {mine.length === 0 ? (
          <Empty>No active deliveries.</Empty>
        ) : (
          mine.map((d) => <ActiveJob key={d.orderId} d={d} busy={busy} run={run} />)
        )}
      </section>

      <section aria-labelledby="pool" className="space-y-3">
        <h2 id="pool" className="text-lg font-bold">
          Available orders
        </h2>
        {!online ? (
          <Empty>Go online to see available orders.</Empty>
        ) : pool.length === 0 ? (
          <Empty>Nothing waiting right now. This list refreshes automatically.</Empty>
        ) : (
          pool.map((d) => (
            <Card key={d.orderId}>
              <p className="font-semibold">
                #{d.orderNumber} · {d.restaurantName ?? "Restaurant"}
              </p>
              <button
                type="button"
                disabled={busy === d.orderId}
                onClick={() => run(d.orderId, () => fleetApi.accept(d.orderId))}
                className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
              >
                Accept
              </button>
            </Card>
          ))
        )}
      </section>
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
  run: (key: string, fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [otp, setOtp] = useState("");
  const btn = "rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60";
  return (
    <Card>
      <p className="font-semibold">
        #{d.orderNumber} · {d.restaurantName ?? "Restaurant"}
      </p>
      <p className="text-sm text-stone-600">{d.status === "ASSIGNED" ? "Go to the restaurant" : "Out for delivery"}</p>
      {d.status === "ASSIGNED" && (
        <button type="button" disabled={busy === d.orderId} onClick={() => run(d.orderId, () => fleetApi.pickedUp(d.orderId))} className={btn}>
          Picked up
        </button>
      )}
      {d.status === "PICKED_UP" && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(d.orderId, () => fleetApi.deliver(d.orderId, otp.trim()).then(() => setOtp("")));
          }}
        >
          <input
            inputMode="numeric"
            autoComplete="off"
            aria-label="Customer delivery OTP"
            placeholder="Customer OTP"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            className="w-40 rounded-lg border border-stone-300 px-3 py-2"
          />
          <button type="submit" disabled={busy === d.orderId || !otp.trim()} className={btn}>
            Delivered
          </button>
        </form>
      )}
    </Card>
  );
}
