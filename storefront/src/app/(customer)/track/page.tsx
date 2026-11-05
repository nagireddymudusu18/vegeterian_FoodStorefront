"use client";

import { useEffect, useState } from "react";
import { errorMessage, orders, type TrackedOrder } from "@/lib/api";
import { Stepper, StatusPill, isFailure, isFinal, statusLabel, useKeepFollowing } from "@/features/orders";
import { formatPaise } from "@/lib/money";
import { ErrorBox } from "@/components/ui";
import { OrderDetailSkeleton } from "@/components/Skeletons";
import { validateOrderNumberInput } from "@/features/ux/form-validation";
import { useFlag } from "@/features/flags";

const POLL_MS = 5000;

const SAMPLE_ORDERS = [
  { code: "FA-7K2M9-P4X8Q", label: "Sattvik Rasoi (Confirmed)" },
  { code: "FA-3R8W5-V2N6J", label: "Ahimsa Pure Veg (Preparing)" },
  { code: "FA-9B4C7-M5T2H", label: "Udupi Tulsi Bhavan (Delivered)" },
];

function TrackResult({ number, onReset }: { number: string; onReset: () => void }) {
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [error, setError] = useState<unknown>(null);
  const following = useKeepFollowing(order?.status);

  useEffect(() => {
    if (!following) return;
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
        if (isFinal(o.status)) return;
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
  }, [number, following]);

  if (error && !order) {
    return (
      <div className="space-y-3">
        <ErrorBox error={error} />
        <button type="button" onClick={onReset} className="text-sm font-semibold text-green-800 underline">
          Try another order number
        </button>
      </div>
    );
  }
  if (!order) {
    return <OrderDetailSkeleton label="Looking up your order" />;
  }

  const failed = isFailure(order.status);
  return (
    <div className="space-y-4">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-green-700 to-green-600 p-5 text-white shadow-md sm:p-7">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-5 top-5 h-10 w-10 rounded-full bg-amber-500 sm:-right-6 sm:-top-8 sm:h-28 sm:w-28"
        />
        <p className="relative text-sm text-green-50">{order.restaurantName}</p>
        <h2 className="relative font-mono text-2xl font-extrabold tracking-wide sm:text-3xl">{order.orderNumber}</h2>
        <p className="relative mt-2 flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
          <StatusPill status={order.status} />
          {following && !isFinal(order.status) && <span className="text-green-50">· updating live</span>}
        </p>
      </header>

      {error !== null && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Could not refresh ({errorMessage(error)}). Retrying...
        </p>
      )}

      {failed ? (
        <div role="status" className="rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-900">
          This order is {statusLabel(order.status).toLowerCase()}.
        </div>
      ) : (
        <section aria-label="Progress" className="card p-4">
          <Stepper status={order.status} />
        </section>
      )}

      <section className="card p-4">
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
          <span className="font-mono tabular-nums">{formatPaise(order.totalPaise)}</span>
        </p>
      </section>

      {order.timeline.length > 0 && (
        <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs">
          <h3 className="mb-2 font-semibold">History</h3>
          <ul className="space-y-1 text-sm text-stone-700">
            {order.timeline.map((t, i) => (
              <li key={i} className="flex justify-between">
                <span>{statusLabel(t.status)}</span>
                <time dateTime={t.at} className="font-mono text-xs text-stone-500">
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
  const [touched, setTouched] = useState(false);
  const [number, setNumber] = useState<string | null>(null);
  const enabled = useFlag("order_tracking");

  const validation = validateOrderNumberInput(input);
  const showError = touched && input.trim().length > 0 && !validation.valid;

  useEffect(() => {
    const n = new URLSearchParams(window.location.search).get("n");
    if (n) {
      const v = validateOrderNumberInput(n);
      setInput(v.formattedInput || n);
      setNumber(v.formattedInput || n);
    }
  }, []);

  const selectCode = (code: string) => {
    setInput(code);
    setTouched(false);
    setNumber(code);
    window.history.replaceState(null, "", `/track?n=${encodeURIComponent(code)}`);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    const n = validation.formattedInput || input.trim();
    if (!n) return;
    setNumber(n);
    window.history.replaceState(null, "", `/track?n=${encodeURIComponent(n)}`);
  };

  if (!enabled) {
    return (
      <p className="mx-auto max-w-md rounded-xl bg-amber-50 p-4 text-center text-amber-900">
        Order tracking is temporarily unavailable.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="text-center">
        <h1 className="page-title">Track your order</h1>
        <p className="mt-1 text-sm text-stone-600">
          Enter the order number from your confirmation receipt. No sign-in needed.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-2" noValidate>
        <div className="flex gap-2">
          <label htmlFor="order-number" className="sr-only">
            Order number
          </label>
          <input
            id="order-number"
            value={input}
            onBlur={() => setTouched(true)}
            onChange={(e) => {
              const v = validateOrderNumberInput(e.target.value);
              setInput(v.formattedInput);
            }}
            placeholder="FA-XXXXX-XXXXX"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={16}
            aria-invalid={showError}
            className={`min-w-0 flex-1 rounded-xl border bg-white px-3.5 py-2.5 font-mono text-sm font-bold uppercase tracking-wider transition-colors focus:border-green-600 focus:outline-none ${
              showError
                ? "border-red-400 bg-red-50/30"
                : validation.valid
                  ? "border-green-600 bg-green-50/20"
                  : "border-stone-300"
            }`}
          />
          <button type="submit" className="btn-primary px-5 py-2.5">
            Track
          </button>
        </div>
        {validation.hint && input.length > 0 && (
          <p className={`text-xs ${validation.valid ? "font-semibold text-green-800" : "text-stone-600"}`}>
            {validation.valid ? `✓ ${validation.hint}` : validation.hint}
          </p>
        )}
      </form>

      <div className="rounded-2xl border border-stone-200/90 bg-white/80 p-3.5 text-xs">
        <p className="font-bold text-stone-700">Quick-select a live kitchen order:</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SAMPLE_ORDERS.map((sample) => {
            const active = number === sample.code;
            return (
              <button
                key={sample.code}
                type="button"
                onClick={() => selectCode(sample.code)}
                className={`rounded-xl border px-2.5 py-1.5 text-left transition ${
                  active
                    ? "border-green-700 bg-green-700 font-bold text-white shadow-xs"
                    : "border-stone-300 bg-stone-50 font-medium text-stone-800 hover:bg-stone-100"
                }`}
              >
                <span className="font-mono font-bold">{sample.code}</span>
                <span className={active ? "ml-1.5 text-green-100" : "ml-1.5 text-stone-500"}>· {sample.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {number && <TrackResult key={number} number={number} onReset={() => setNumber(null)} />}
    </div>
  );
}
