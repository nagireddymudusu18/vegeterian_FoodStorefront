"use client";

import { useEffect, useState } from "react";
import { errorMessage, orders, type TrackedOrder } from "@/lib/api";
import { Stepper, isFailure, isTerminal, statusLabel } from "@/features/orders";
import { formatPaise } from "@/lib/money";
import { ErrorBox } from "@/components/ui";
import { useFlag } from "@/features/flags";

const POLL_MS = 5000;

function TrackResult({ number, onReset }: { number: string; onReset: () => void }) {
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let found = false;
    const ctrl = new AbortController();

    const tick = async () => {
      try {
        const o = await orders.track(number, ctrl.signal);
        if (stop) return;
        found = true;
        setOrder(o);
        setError(null);
        if (isTerminal(o.status)) return;
      } catch (e) {
        if (stop || (e instanceof DOMException && e.name === "AbortError")) return;
        setError(e);
        if (!found) return; // not found or rate limited: do not hammer the endpoint
      }
      timer = setTimeout(tick, POLL_MS);
    };
    void tick();

    return () => {
      stop = true;
      ctrl.abort();
      if (timer) clearTimeout(timer);
    };
  }, [number]);

  if (error && !order) {
    return (
      <div className="space-y-3">
        <ErrorBox error={error} />
        <button type="button" onClick={onReset} className="text-sm underline">
          Try another number
        </button>
      </div>
    );
  }
  if (!order) {
    return (
      <p role="status" className="py-6 text-center text-stone-600">
        Looking up your order...
      </p>
    );
  }

  const failed = isFailure(order.status);
  return (
    <div className="space-y-4">
      <header className="rounded-2xl bg-gradient-to-br from-green-600 to-emerald-700 p-5 text-white shadow">
        <p className="text-sm opacity-90">{order.restaurantName}</p>
        <h2 className="text-2xl font-extrabold tracking-wide">{order.orderNumber}</h2>
        <p className="mt-1 text-sm" aria-live="polite">
          {statusLabel(order.status)}
          {!isTerminal(order.status) && " · updating live"}
        </p>
      </header>

      {error !== null && (
        <p role="status" className="rounded bg-amber-50 p-2 text-sm text-amber-900">
          Could not refresh ({errorMessage(error)}). Retrying...
        </p>
      )}

      {failed ? (
        <div role="status" className="rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-900">
          This order is {statusLabel(order.status).toLowerCase()}.
        </div>
      ) : (
        <section aria-label="Progress" className="rounded-xl border border-stone-200 bg-white p-4">
          <Stepper status={order.status} />
        </section>
      )}

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <h3 className="mb-2 font-semibold">Items</h3>
        <ul className="space-y-1 text-sm">
          {order.items.map((it, i) => (
            <li key={i}>
              {it.quantity} x {it.name}
            </li>
          ))}
        </ul>
        <p className="mt-3 flex justify-between border-t border-stone-200 pt-2 font-bold">
          <span>Total</span>
          <span>{formatPaise(order.totalPaise)}</span>
        </p>
      </section>

      {order.timeline.length > 0 && (
        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <h3 className="mb-2 font-semibold">History</h3>
          <ul className="space-y-1 text-sm text-stone-700">
            {order.timeline.map((t, i) => (
              <li key={i} className="flex justify-between">
                <span>{statusLabel(t.status)}</span>
                <time dateTime={t.at} className="text-stone-500">
                  {new Date(t.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                </time>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function TrackPage() {
  const [input, setInput] = useState("");
  const [number, setNumber] = useState<string | null>(null);
  const enabled = useFlag("order_tracking");

  useEffect(() => {
    const n = new URLSearchParams(window.location.search).get("n");
    if (n) {
      setInput(n);
      setNumber(n);
    }
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = input.trim();
    if (!n) return;
    setNumber(n);
    window.history.replaceState(null, "", `/track?n=${encodeURIComponent(n)}`);
  };

  if (!enabled) {
    return <p className="mx-auto max-w-md rounded-xl bg-amber-50 p-4 text-center text-amber-900">Order tracking is temporarily unavailable.</p>;
  }

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Track your order</h1>
        <p className="mt-1 text-sm text-stone-600">Enter the order number from your confirmation. No sign-in needed.</p>
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <label htmlFor="order-number" className="sr-only">
          Order number
        </label>
        <input
          id="order-number"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="FA-XXXXX-XXXXX"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={32}
          className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2.5 font-mono uppercase tracking-wider focus:border-green-600"
        />
        <button type="submit" className="rounded-xl bg-green-700 px-5 py-2.5 font-semibold text-white hover:bg-green-800">
          Track
        </button>
      </form>
      {number && <TrackResult key={number} number={number} onReset={() => setNumber(null)} />}
    </div>
  );
}
