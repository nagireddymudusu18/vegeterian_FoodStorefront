"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { orders, errorMessage, type Order } from "@/lib/api";
import { Stepper, canCancel, isFailure, isTerminal, statusLabel, useOrderStream } from "@/features/orders";
import { formatPaise } from "@/lib/money";
import { useRequireAuth } from "@/features/auth";
import { useFlag } from "@/features/flags";
import { ConfirmDialog, ErrorBox, Spinner } from "@/components/ui";

const POLL_MS = 3000;
const POLL_LIVE_MS = 15000;

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const auth = useRequireAuth();
  const authed = auth.status === "authed";
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const status = order?.status;
  const terminal = status ? isTerminal(status) : false;
  const liveOn = useFlag("live_order_updates");
  const statusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    statusRef.current = status;
  });

  const live = useOrderStream(id, authed && !terminal && liveOn, (s) => {
    if (s !== statusRef.current) setNonce((n) => n + 1);
  });
  const pollMs = live ? POLL_LIVE_MS : POLL_MS;

  useEffect(() => {
    if (!authed || terminal) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ctrl = new AbortController();

    const tick = async () => {
      try {
        const o = await orders.get(id, ctrl.signal);
        if (stop) return;
        setOrder(o);
        setError(null);
        setLoading(false);
        if (isTerminal(o.status)) return; // stop polling once the order is final
      } catch (e) {
        if (stop || (e instanceof DOMException && e.name === "AbortError")) return;
        setError(e);
        setLoading(false);
      }
      timer = setTimeout(tick, pollMs);
    };
    void tick();

    return () => {
      stop = true;
      ctrl.abort();
      if (timer) clearTimeout(timer);
    };
  }, [id, authed, terminal, nonce, pollMs]);

  const doCancel = useCallback(async () => {
    setCancelling(true);
    setCancelError(null);
    try {
      await orders.cancel(id);
      setConfirmCancel(false);
      setNonce((n) => n + 1);
    } catch (e) {
      setConfirmCancel(false);
      setCancelError(errorMessage(e));
    } finally {
      setCancelling(false);
    }
  }, [id]);

  if (!authed) return <Spinner label="Loading order" />;
  if (loading) return <Spinner label="Loading order" />;
  if (!order) return <ErrorBox error={error} onRetry={() => setNonce((n) => n + 1)} />;

  const failed = isFailure(order.status);

  return (
    <div className="space-y-5">
      <Link href="/orders" className="text-sm text-green-800 underline">
        &larr; All orders
      </Link>
      <header>
        <h1 className="text-2xl font-bold">Order {order.orderNumber ?? order.id.slice(0, 8)}</h1>
        {order.orderNumber && (
          <p className="mt-1 text-xs text-stone-600">
            Keep this number. You can track the order any time at{" "}
            <Link href={`/track?n=${encodeURIComponent(order.orderNumber)}`} className="font-semibold text-green-800 underline">
              Track order
            </Link>
            , without signing in.
          </p>
        )}
        <p className="mt-1 text-sm text-stone-600" aria-live="polite">
          Status: <span className="font-semibold">{statusLabel(order.status)}</span>
          {!terminal && (live ? " (live)" : " (updating every 3 seconds)")}
        </p>
      </header>

      {error !== null && (
        <p role="status" className="rounded bg-amber-50 p-2 text-sm text-amber-900">
          Could not refresh the latest status ({errorMessage(error)}). Retrying...
        </p>
      )}

      {order.deliveryOtp && !terminal && (
        <div className="rounded-xl border-2 border-green-700 bg-green-50 p-4 text-center">
          <p className="text-sm text-green-900">Share this delivery OTP with your rider</p>
          <p className="mt-1 text-4xl font-bold tracking-[0.3em] text-green-900" aria-label={`Delivery OTP ${order.deliveryOtp.split("").join(" ")}`}>
            {order.deliveryOtp}
          </p>
        </div>
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

      <section className="rounded-xl border border-stone-200 bg-white p-4" aria-labelledby="sum-h">
        <h2 id="sum-h" className="mb-2 font-semibold">
          Bill (confirmed by server)
        </h2>
        {order.items && order.items.length > 0 && (
          <ul className="mb-3 space-y-1 text-sm">
            {order.items.map((it, i) => {
              const line = it.linePaise ?? (it.unitPricePaise ?? it.pricePaise ?? 0) * it.quantity;
              return (
                <li key={`${it.itemId ?? i}`} className="flex justify-between">
                  <span>
                    {it.quantity} x {it.name ?? it.itemId ?? "Item"}
                  </span>
                  {line > 0 && <span>{formatPaise(line)}</span>}
                </li>
              );
            })}
          </ul>
        )}
        <dl className="space-y-1 text-sm">
          <Row label="Subtotal" v={order.subtotalPaise} />
          <Row label="Tax" v={order.taxPaise} />
          <Row label="Delivery fee" v={order.deliveryFeePaise} />
          <div className="flex justify-between border-t border-stone-200 pt-2 text-base font-bold">
            <dt>Total</dt>
            <dd>{formatPaise(order.totalPaise)}</dd>
          </div>
        </dl>
      </section>

      {cancelError && <ErrorBox error={new Error(cancelError)} />}

      {canCancel(order.status) && (
        <button
          type="button"
          onClick={() => setConfirmCancel(true)}
          className="rounded-lg border border-red-300 px-4 py-2 font-medium text-red-800 hover:bg-red-50"
        >
          Cancel order
        </button>
      )}

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel this order?"
        confirmLabel="Yes, cancel order"
        cancelLabel="Keep order"
        destructive
        busy={cancelling}
        onConfirm={doCancel}
        onCancel={() => setConfirmCancel(false)}
      >
        If you have already paid, a refund will be issued where applicable.
      </ConfirmDialog>
    </div>
  );
}

function Row({ label, v }: { label: string; v: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-stone-600">{label}</dt>
      <dd>{formatPaise(v)}</dd>
    </div>
  );
}
