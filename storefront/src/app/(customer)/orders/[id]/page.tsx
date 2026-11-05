"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { orders, errorMessage, type Order } from "@/lib/api";
import {
  CANCELLATION_REASONS,
  Stepper,
  StatusPill,
  canCancel,
  cancellationPolicySummary,
  formatCancellationReason,
  isFailure,
  isFinal,
  isTerminal,
  refundStatusBanner,
  statusLabel,
  useKeepFollowing,
  useOrderStream,
} from "@/features/orders";
import { useCart } from "@/features/cart";
import { formatPaise } from "@/lib/money";
import { useRequireAuth } from "@/features/auth";
import { useFlag } from "@/features/flags";
import { ConfirmDialog, ErrorBox, Spinner } from "@/components/ui";

const POLL_MS = 3000;
const POLL_LIVE_MS = 15000;

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const auth = useRequireAuth();
  const { add, clear } = useCart();
  const authed = auth.status === "authed";
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string>(CANCELLATION_REASONS[0]);
  const [customNote, setCustomNote] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [showInvoice, setShowInvoice] = useState(false);
  const [nonce, setNonce] = useState(0);

  const status = order?.status;
  const terminal = status ? isTerminal(status) : false;
  const following = useKeepFollowing(status);
  const liveOn = useFlag("live_order_updates");
  const statusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    statusRef.current = status;
  });

  const live = useOrderStream(id, authed && following && liveOn, (s) => {
    if (s !== statusRef.current) setNonce((n) => n + 1);
  });
  const pollMs = live ? POLL_LIVE_MS : POLL_MS;

  useEffect(() => {
    if (!authed) return;
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
        if (!following || isFinal(o.status)) return; // stop polling once the order is final
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
  }, [id, authed, following, nonce, pollMs]);

  const doCancel = useCallback(async () => {
    setCancelling(true);
    setCancelError(null);
    const reasonText = formatCancellationReason(selectedReason, customNote);
    try {
      const updated = await orders.cancel(id, reasonText);
      if (updated) setOrder(updated);
      setConfirmCancel(false);
      toast.success("Order cancelled and instant refund initiated.");
      setNonce((n) => n + 1);
    } catch (e) {
      setConfirmCancel(false);
      setCancelError(errorMessage(e));
    } finally {
      setCancelling(false);
    }
  }, [id, selectedReason, customNote]);

  const handleReorder = () => {
    if (!order || !order.restaurantId || !order.items?.length) return;
    clear();
    const rest = { id: order.restaurantId, name: order.restaurantName ?? "Restaurant" };
    for (const it of order.items) {
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
    toast.success("Items added to your cart");
    router.push("/cart");
  };

  if (!authed) return <Spinner label="Loading order" />;
  if (loading) return <Spinner label="Loading order" />;
  if (!order) return <ErrorBox error={error} onRetry={() => setNonce((n) => n + 1)} />;

  const failed = isFailure(order.status);
  const halfTaxPaise = Math.round(order.taxPaise / 2);
  const policy = cancellationPolicySummary(order.status);
  const refundBanner = refundStatusBanner(order);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/orders" className="text-sm font-medium text-green-800 underline">
          &larr; All orders
        </Link>
        <div className="flex flex-wrap gap-2">
          {order.restaurantId && order.items && order.items.length > 0 && (
            <button
              type="button"
              onClick={handleReorder}
              className="rounded-xl border border-[#1B5E3A] bg-white px-3.5 py-1.5 text-xs font-bold text-[#1B5E3A] hover:bg-green-50"
            >
              Order again
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowInvoice((v) => !v)}
            className="rounded-xl border border-stone-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-100"
          >
            {showInvoice ? "Hide GST invoice" : "GST tax invoice"}
          </button>
        </div>
      </div>

      <header>
        <h1 className="page-title">Order {order.orderNumber ?? order.id.slice(0, 8)}</h1>
        {order.restaurantName && (
          <p className="mt-0.5 text-sm font-semibold text-stone-700">From {order.restaurantName}</p>
        )}
        {order.orderNumber && (
          <p className="mt-1 text-xs text-stone-600">
            Keep this number. You can track the order any time at{" "}
            <Link href={`/track?n=${encodeURIComponent(order.orderNumber)}`} className="font-semibold text-green-800 underline">
              Track order
            </Link>
            , without signing in.
          </p>
        )}
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-stone-600" aria-live="polite">
          <span>Status:</span> <StatusPill status={order.status} />
          {following && !isFinal(order.status) && <span>{live ? "(live)" : "(updating every 3 seconds)"}</span>}
        </p>
      </header>

      {error !== null && (
        <p role="status" className="rounded bg-amber-50 p-2 text-sm text-amber-900">
          Could not refresh the latest status ({errorMessage(error)}). Retrying...
        </p>
      )}

      {order.deliveryOtp && !terminal && (
        <div className="rounded-2xl border-2 border-amber-500 bg-amber-50 p-4 text-center">
          <p className="text-sm font-medium text-amber-900">Share this delivery OTP with your rider</p>
          <p className="mt-1 text-4xl font-extrabold tracking-[0.3em] text-amber-900" aria-label={`Delivery OTP ${order.deliveryOtp.split("").join(" ")}`}>
            {order.deliveryOtp}
          </p>
        </div>
      )}

      {refundBanner.state !== "NONE" && (
        <section
          role="status"
          aria-label="Refund settlement status"
          className="rounded-2xl border border-green-300 bg-green-50/90 p-4 text-sm text-green-950"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#1B5E3A]">
                Instant Refund Tracker · {refundBanner.state === "REFUNDED" ? "Completed" : "Processing"}
              </p>
              <h2 className="mt-0.5 text-base font-extrabold text-stone-900">{refundBanner.headline}</h2>
            </div>
            <span className="font-mono text-lg font-extrabold tabular-nums text-[#1B5E3A]">
              {formatPaise(refundBanner.amountPaise)}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-stone-700">{refundBanner.detail}</p>
          {refundBanner.reason && (
            <p className="mt-1.5 text-xs font-semibold text-stone-800">
              Recorded cancellation reason: <span className="font-normal">{refundBanner.reason}</span>
            </p>
          )}
          <div className="mt-2">
            <Link href="/refunds" className="text-xs font-bold text-[#1B5E3A] underline">
              View Veggo Eats Refund &amp; Cancellation Policy &rarr;
            </Link>
          </div>
        </section>
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

      {!terminal && (
        <section
          aria-label="Cancellation policy"
          className="card flex flex-wrap items-center justify-between gap-3 p-4"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-stone-900">{policy.headline}</p>
            <p className="text-xs text-stone-600">{policy.detail}</p>
          </div>
          {canCancel(order.status) && (
            <button
              type="button"
              onClick={() => setConfirmCancel(true)}
              className="rounded-xl border border-red-300 bg-white px-4 py-2 text-xs font-bold text-red-800 hover:bg-red-50 whitespace-nowrap shrink-0"
            >
              Cancel order
            </button>
          )}
        </section>
      )}

      {(order.deliveryAddress || order.cookingInstructions) && (
        <section className="card grid gap-3 p-4 sm:grid-cols-2" aria-label="Delivery and kitchen notes">
          {order.deliveryAddress && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Delivering to</p>
              <p className="mt-0.5 text-sm font-semibold text-stone-900">{order.deliveryAddress}</p>
            </div>
          )}
          {order.cookingInstructions && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Kitchen instructions</p>
              <p className="mt-0.5 text-sm font-semibold text-amber-900">{order.cookingInstructions}</p>
            </div>
          )}
        </section>
      )}

      {showInvoice && (
        <section className="card space-y-3 border-2 border-[#1B5E3A]/30 bg-[#FBF6EA] p-5" aria-labelledby="gst-inv-h">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-stone-300 pb-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#1B5E3A]">
                Veggo Eats · Tax Invoice (GST)
              </p>
              <h2 id="gst-inv-h" className="text-base font-extrabold text-stone-900">
                Invoice #{order.orderNumber ?? order.id.slice(0, 8)}
              </h2>
              <p className="text-xs text-stone-600">
                Kitchen: <strong>{order.restaurantName ?? "Partner Kitchen"}</strong>
                {order.createdAt ? ` · Issued ${new Date(order.createdAt).toLocaleString("en-IN")}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-xl bg-[#1B5E3A] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-green-800"
            >
              Print / Save PDF
            </button>
          </div>

          <div className="space-y-1 text-xs text-stone-700">
            <div className="flex justify-between">
              <span>Food Subtotal (HSN/SAC 996331)</span>
              <span>{formatPaise(order.subtotalPaise)}</span>
            </div>
            <div className="flex justify-between">
              <span>CGST (2.5%)</span>
              <span>{formatPaise(halfTaxPaise)}</span>
            </div>
            <div className="flex justify-between">
              <span>SGST (2.5%)</span>
              <span>{formatPaise(order.taxPaise - halfTaxPaise)}</span>
            </div>
            <div className="flex justify-between">
              <span>Delivery &amp; Packaging Charges</span>
              <span>{formatPaise(order.deliveryFeePaise)}</span>
            </div>
            <div className="flex justify-between border-t border-stone-300 pt-2 text-sm font-bold text-stone-900">
              <span>Grand Total (INR)</span>
              <span>{formatPaise(order.totalPaise)}</span>
            </div>
          </div>
        </section>
      )}

      <section className="card p-4" aria-labelledby="sum-h">
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
                  {line > 0 && <span className="font-mono tabular-nums">{formatPaise(line)}</span>}
                </li>
              );
            })}
          </ul>
        )}
        <dl className="space-y-1 text-sm">
          <Row label="Subtotal" v={order.subtotalPaise} />
          <Row label="Tax (5% GST)" v={order.taxPaise} />
          <Row label="Delivery fee" v={order.deliveryFeePaise} />
          <div className="flex justify-between border-t border-stone-200 pt-2 text-base font-bold">
            <dt>Total</dt>
            <dd className="font-mono tabular-nums">{formatPaise(order.totalPaise)}</dd>
          </div>
        </dl>
      </section>

      {order.timeline && order.timeline.length > 0 && (
        <section className="card p-4" aria-labelledby="timeline-h">
          <h2 id="timeline-h" className="mb-2 text-sm font-bold text-stone-900">
            Order activity log
          </h2>
          <ol className="divide-y divide-stone-200/80 text-xs">
            {order.timeline.map((entry, idx) => (
              <li key={`${entry.status}-${idx}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <span className="font-semibold text-stone-900">{statusLabel(entry.status)}</span>
                  {entry.reason && <span className="text-stone-600"> · {entry.reason}</span>}
                </div>
                <time className="font-mono tabular-nums text-stone-500">
                  {new Date(entry.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </time>
              </li>
            ))}
          </ol>
        </section>
      )}

      {cancelError && <ErrorBox error={new Error(cancelError)} />}

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel this order?"
        confirmLabel="Yes, cancel & refund"
        cancelLabel="Keep order"
        destructive
        busy={cancelling}
        onConfirm={doCancel}
        onCancel={() => setConfirmCancel(false)}
      >
        <div className="space-y-3 text-left">
          <p className="text-xs text-stone-600">
            Because the kitchen has not started preparing your food yet, cancelling now triggers an immediate{" "}
            <strong>{formatPaise(order.totalPaise)}</strong> refund to your original payment method.
          </p>
          <div>
            <label htmlFor="cancel-reason-select" className="mb-1 block text-xs font-bold text-stone-800">
              Reason for cancellation
            </label>
            <select
              id="cancel-reason-select"
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
            >
              {CANCELLATION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cancel-reason-note" className="mb-1 block text-xs font-bold text-stone-800">
              Additional note (optional)
            </label>
            <input
              id="cancel-reason-note"
              type="text"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="e.g. Want to add extra items and reorder"
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
            />
          </div>
        </div>
      </ConfirmDialog>
    </div>
  );
}

function Row({ label, v }: { label: string; v: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-stone-600">{label}</dt>
      <dd className="font-mono tabular-nums">{formatPaise(v)}</dd>
    </div>
  );
}
