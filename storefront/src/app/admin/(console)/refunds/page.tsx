"use client";

import { useState } from "react";
import { toast } from "sonner";
import { newRequestId, payments, type Payment, type RefundResponse } from "@/lib/api";
import { formatPaise } from "@/lib/money";
import { ConfirmDialog, ErrorBox } from "@/components/ui";

export default function AdminRefundsPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [rupeesInput, setRupeesInput] = useState("");
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [lastRefund, setLastRefund] = useState<RefundResponse | null>(null);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = query.trim();
    if (!id) return;
    setLoading(true);
    setError(null);
    setLastRefund(null);
    try {
      const found = await payments.get(id);
      setPayment(found);
      if (typeof found.amountPaise === "number") {
        setRupeesInput((found.amountPaise / 100).toFixed(2));
      } else {
        setRupeesInput("");
      }
    } catch (err) {
      setPayment(null);
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const parsedPaise = Math.round(Number(rupeesInput) * 100);
  const maxPaise = payment?.amountPaise ?? 0;
  const amountValid =
    Number.isFinite(parsedPaise) && parsedPaise > 0 && (maxPaise === 0 || parsedPaise <= maxPaise);
  const canRefund = !!payment && payment.status === "CAPTURED" && amountValid && reason.trim().length >= 3;

  const executeRefund = async () => {
    if (!payment || !canRefund) return;
    setConfirmOpen(false);
    setRefunding(true);
    setError(null);
    try {
      const res = await payments.refund(payment.id, parsedPaise, `admin-refund:${payment.id}:${newRequestId()}`);
      setLastRefund(res);
      const refreshed = await payments.get(payment.id).catch(() => ({ ...payment, status: "REFUNDED" }));
      setPayment(refreshed);
      toast.success(`Refunded ${formatPaise(res.amountPaise)}`);
    } catch (err) {
      setError(err);
    } finally {
      setRefunding(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Manual refunds</h1>
        <p className="text-sm text-stone-600">
          Cancelled or rejected orders are refunded automatically. Use this tool when a customer dispute or delivery issue
          requires a manual full or partial refund against a captured payment.
        </p>
      </div>

      <form onSubmit={lookup} className="card flex flex-wrap items-end gap-3 p-5">
        <label className="min-w-64 flex-1 space-y-1 text-sm">
          <span className="font-semibold text-stone-800">Payment ID (or Order ID / Order # in sandbox)</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. UUID from payment-service or FA-XXXXX-XXXXX"
            required
            className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-sm"
          />
        </label>
        <button type="submit" disabled={loading || !query.trim()} className="btn-primary py-2.5 text-sm">
          {loading ? "Looking up..." : "Look up payment"}
        </button>
      </form>

      {error !== null && <ErrorBox error={error} />}

      {lastRefund && (
        <div role="status" className="rounded-2xl border border-green-300 bg-green-50 p-4 text-sm text-green-900">
          <p className="font-bold">Refund issued ({lastRefund.status})</p>
          <p className="mt-1">
            Refund ID <code className="rounded bg-white px-1.5 py-0.5 text-xs">{lastRefund.refundId}</code> · Amount{" "}
            <strong>{formatPaise(lastRefund.amountPaise)}</strong>
            {lastRefund.gatewayRef ? ` · Gateway ref ${lastRefund.gatewayRef}` : ""}
          </p>
        </div>
      )}

      {payment && (
        <div className="card space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Payment</p>
              <h2 className="font-mono text-base font-bold">{payment.id}</h2>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                payment.status === "CAPTURED"
                  ? "bg-green-100 text-green-800"
                  : payment.status === "REFUNDED"
                    ? "bg-amber-100 text-amber-900"
                    : "bg-stone-200 text-stone-700"
              }`}
            >
              {payment.status}
            </span>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-stone-500">Captured amount</dt>
              <dd className="font-bold">
                {typeof payment.amountPaise === "number" ? formatPaise(payment.amountPaise) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-stone-500">Order ID</dt>
              <dd className="font-mono text-xs">{payment.orderId ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-stone-500">Gateway / Ref</dt>
              <dd className="font-mono text-xs">
                {payment.gateway ?? "—"} {payment.gatewayRef ? `(${payment.gatewayRef})` : ""}
              </dd>
            </div>
          </dl>

          {payment.status === "CAPTURED" ? (
            <div className="space-y-4 rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-200">
              <h3 className="text-sm font-bold">Issue manual refund</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-stone-700">
                    Refund amount (₹){maxPaise > 0 ? ` — max ${formatPaise(maxPaise)}` : ""}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={maxPaise > 0 ? (maxPaise / 100).toFixed(2) : undefined}
                    value={rupeesInput}
                    onChange={(e) => setRupeesInput(e.target.value)}
                    className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-stone-700">Audit note / reason (required)</span>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Damaged packaging reported by customer"
                    className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-stone-600">
                  Refunding a payment is irreversible and moves the order to <strong>REFUNDED</strong>.
                </p>
                <button
                  type="button"
                  disabled={!canRefund || refunding}
                  onClick={() => setConfirmOpen(true)}
                  className="rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {refunding ? "Refunding..." : "Issue refund"}
                </button>
              </div>
            </div>
          ) : (
            <p className="rounded-xl bg-stone-100 p-3 text-sm text-stone-700">
              This payment is <strong>{payment.status}</strong> and cannot be refunded again.
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm manual refund"
        confirmLabel="Confirm refund"
        destructive
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void executeRefund()}
      >
        Issue a manual refund of <strong>{amountValid ? formatPaise(parsedPaise) : "₹0"}</strong> for payment{" "}
        <code>{payment?.id}</code>? Reason: <em>{reason.trim()}</em>.
      </ConfirmDialog>
    </div>
  );
}
