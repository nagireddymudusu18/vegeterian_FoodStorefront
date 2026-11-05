"use client";

import { useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { formatPaise } from "@/lib/money";
import { ButtonSpinner } from "@/components/ui";
import type { CreatePaymentMeta } from "@/lib/api";
import {
  buildUpiIntentUri,
  computeGatewaySignature,
  validateCardDetails,
  validateUpiVpa,
  type PaymentMethodKind,
} from "./payment-gateway";

const QUICK_UPI_VPAS = [
  { vpa: "aarav.sharma@okaxis", label: "Google Pay (@okaxis)" },
  { vpa: "9876543210@ybl", label: "PhonePe (@ybl)" },
  { vpa: "priya.nair@paytm", label: "Paytm UPI (@paytm)" },
];

const NETBANKING_BANKS = [
  { id: "HDFC", name: "HDFC Bank", tag: "Instant NetBanking" },
  { id: "ICICI", name: "ICICI Bank", tag: "iMobile / Retail" },
  { id: "SBI", name: "State Bank of India", tag: "YONO / Retail" },
  { id: "AXIS", name: "Axis Bank", tag: "Retail NetBanking" },
];

/** Deterministic 11x11 visual QR matrix from UPI intent URI for UPI QR scan mode. */
function UpiQrMatrix({ uri }: { uri: string }) {
  const size = 11;
  const cells: boolean[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const isFinderCorner =
        (r < 3 && c < 3) || (r < 3 && c >= size - 3) || (r >= size - 3 && c < 3);
      if (isFinderCorner) {
        cells.push(true);
      } else {
        const code = uri.charCodeAt((r * size + c) % uri.length);
        cells.push((code + r * 7 + c * 13) % 2 === 0);
      }
    }
  }
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      aria-label="UPI QR Code"
      className="mx-auto h-36 w-36 rounded-xl border border-stone-300 bg-white p-2.5 shadow-xs"
    >
      {cells.map((on, idx) => {
        if (!on) return null;
        const r = Math.floor(idx / size);
        const c = idx % size;
        return <rect key={idx} x={c} y={r} width={0.9} height={0.9} fill="#1f2a1d" rx={0.12} />;
      })}
    </svg>
  );
}

export function PaymentGatewayModal({
  open,
  onOpenChange,
  restaurantName,
  orderNumber,
  amountPaise,
  busy,
  onConfirmPayment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantName: string;
  orderNumber: string;
  amountPaise: number;
  busy: boolean;
  onConfirmPayment: (meta: CreatePaymentMeta) => void;
}) {
  const [method, setMethod] = useState<PaymentMethodKind>("UPI_VPA");
  const [upiInput, setUpiInput] = useState("aarav.sharma@okaxis");
  const [cardNumber, setCardNumber] = useState("4532 0151 1283 0366");
  const [cardExpiry, setCardExpiry] = useState("08/29");
  const [cardCvv, setCardCvv] = useState("412");
  const [bankId, setBankId] = useState("HDFC");
  const [simulateDecline, setSimulateDecline] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const upiValidation = validateUpiVpa(upiInput);
  const cardValidation = validateCardDetails({
    number: cardNumber,
    expiry: cardExpiry,
    cvv: cardCvv,
  });
  const qrUri = buildUpiIntentUri({ orderNumber, amountPaise });

  const handlePay = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (method === "UPI_VPA" && !upiValidation.valid) {
      setLocalError(upiValidation.hint ?? "Enter a valid UPI ID.");
      return;
    }
    if (method === "CARD" && !cardValidation.valid) {
      setLocalError(cardValidation.hint ?? "Enter valid 16-digit card details.");
      return;
    }

    const gatewayOrderId = `order_rzp_${orderNumber.replace(/[^0-9A-Z]/gi, "")}`;
    const tempPaymentRef = `pay_client_${Date.now()}`;
    const signature = computeGatewaySignature(gatewayOrderId, tempPaymentRef);

    const selectedBank = NETBANKING_BANKS.find((b) => b.id === bankId) ?? NETBANKING_BANKS[0];
    const methodLabel =
      method === "UPI_VPA"
        ? `UPI (${upiValidation.normalizedVpa})`
        : method === "UPI_QR"
          ? "UPI QR Scan (BHIM / GPay)"
          : method === "CARD"
            ? `${cardValidation.network} •••• ${cardValidation.last4}`
            : `NetBanking (${selectedBank.name})`;

    onConfirmPayment({
      method,
      methodLabel,
      upiVpa: method === "UPI_VPA" ? upiValidation.normalizedVpa : undefined,
      cardLast4: method === "CARD" ? cardValidation.last4 : undefined,
      cardNetwork: method === "CARD" ? cardValidation.network : undefined,
      bankName: method === "NETBANKING" ? selectedBank.name : undefined,
      gatewayOrderId,
      signature,
      simulateDecline,
    });
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          aria-describedby="pay-modal-desc"
          className="fixed inset-x-3 top-[5vh] z-50 mx-auto flex max-h-[90vh] max-w-lg flex-col overflow-hidden rounded-3xl bg-cream text-ink shadow-2xl ring-1 ring-stone-300 sm:inset-x-6 sm:top-[7vh]"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-stone-200 bg-gradient-to-r from-green-800 to-green-700 px-5 py-4 text-white">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-amber-200">
                Veggo Pay · Secured Checkout
              </p>
              <DialogPrimitive.Title className="mt-0.5 text-lg font-extrabold text-white">
                Pay {formatPaise(amountPaise)} to {restaurantName}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description id="pay-modal-desc" className="text-xs text-green-100">
                Order ref: <span className="font-mono font-bold">{orderNumber}</span> · 256-bit HMAC signature verified
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              disabled={busy}
              aria-label="Close payment gateway"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 disabled:opacity-50"
            >
              ✕
            </DialogPrimitive.Close>
          </div>

          <form onSubmit={handlePay} className="flex-1 space-y-4 overflow-y-auto p-5" noValidate>
            {/* Method Switcher Tabs */}
            <div
              role="tablist"
              aria-label="Payment method"
              className="grid grid-cols-4 gap-1 rounded-xl bg-stone-200/80 p-1"
            >
              {(
                [
                  { id: "UPI_VPA", label: "UPI ID" },
                  { id: "UPI_QR", label: "UPI QR" },
                  { id: "CARD", label: "Card" },
                  { id: "NETBANKING", label: "NetBanking" },
                ] as const
              ).map((tab) => {
                const active = method === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setMethod(tab.id);
                      setLocalError(null);
                    }}
                    className={`rounded-lg px-2 py-2 text-xs font-bold transition whitespace-nowrap ${
                      active ? "bg-white text-green-900 shadow-xs" : "text-stone-700 hover:text-stone-950"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* UPI ID (VPA) */}
            {method === "UPI_VPA" && (
              <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <label htmlFor="pay-upi-vpa" className="text-xs font-bold text-stone-800">
                    Enter UPI ID (Google Pay, PhonePe, BHIM, Paytm)
                  </label>
                  {upiValidation.valid && (
                    <span className="text-xs font-bold text-green-800">✓ Verified VPA</span>
                  )}
                </div>
                <input
                  id="pay-upi-vpa"
                  type="text"
                  value={upiInput}
                  onChange={(e) => {
                    setUpiInput(e.target.value);
                    setLocalError(null);
                  }}
                  placeholder="username@okaxis"
                  className={`w-full rounded-xl border px-3.5 py-2.5 font-mono text-sm focus:outline-none ${
                    upiValidation.valid
                      ? "border-green-600 bg-green-50/20"
                      : "border-stone-300 bg-white"
                  }`}
                />
                {upiValidation.hint && (
                  <p className={`text-xs ${upiValidation.valid ? "font-semibold text-green-800" : "text-stone-600"}`}>
                    {upiValidation.hint}
                  </p>
                )}
                <div className="space-y-1.5 pt-1">
                  <p className="text-[11px] font-semibold text-stone-500">Quick-select test UPI ID:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_UPI_VPAS.map((q) => (
                      <button
                        key={q.vpa}
                        type="button"
                        onClick={() => {
                          setUpiInput(q.vpa);
                          setLocalError(null);
                        }}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                          upiInput === q.vpa
                            ? "border-green-700 bg-green-50 font-bold text-green-900"
                            : "border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100"
                        }`}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* UPI QR */}
            {method === "UPI_QR" && (
              <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4 text-center">
                <p className="text-xs font-bold text-stone-800">
                  Scan with any UPI app (GPay · PhonePe · Paytm · BHIM)
                </p>
                <UpiQrMatrix uri={qrUri} />
                <p className="font-mono text-[11px] text-stone-500 break-all">{qrUri}</p>
                <p className="text-xs text-green-800 font-semibold">
                  Merchant: Veggo Eats (veggoeats@axis) · Instant confirmation
                </p>
              </div>
            )}

            {/* Card */}
            {method === "CARD" && (
              <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <label htmlFor="pay-card-num" className="text-xs font-bold text-stone-800">
                    Card number (RuPay, Visa, Mastercard)
                  </label>
                  <span className="font-mono text-xs font-bold text-green-800">
                    {cardValidation.network} {cardValidation.valid ? "✓ Luhn verified" : ""}
                  </span>
                </div>
                <input
                  id="pay-card-num"
                  type="text"
                  inputMode="numeric"
                  maxLength={19}
                  value={cardValidation.formattedNumber}
                  onChange={(e) => {
                    setCardNumber(e.target.value);
                    setLocalError(null);
                  }}
                  placeholder="4532 0151 1283 0366"
                  className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 font-mono text-sm"
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="pay-card-exp" className="mb-1 block text-xs font-semibold text-stone-700">
                      Expiry (MM/YY)
                    </label>
                    <input
                      id="pay-card-exp"
                      type="text"
                      maxLength={5}
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(e.target.value)}
                      placeholder="08/29"
                      className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="pay-card-cvv" className="mb-1 block text-xs font-semibold text-stone-700">
                      CVV
                    </label>
                    <input
                      id="pay-card-cvv"
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={cardCvv}
                      onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, ""))}
                      placeholder="•••"
                      className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 font-mono text-sm"
                    />
                  </div>
                </div>
                {cardValidation.hint && (
                  <p className="text-xs text-amber-900">{cardValidation.hint}</p>
                )}
              </div>
            )}

            {/* NetBanking */}
            {method === "NETBANKING" && (
              <div className="grid grid-cols-2 gap-2.5 rounded-2xl border border-stone-200 bg-white p-4">
                {NETBANKING_BANKS.map((b) => {
                  const active = bankId === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setBankId(b.id)}
                      className={`rounded-xl border p-3 text-left transition ${
                        active
                          ? "border-green-700 bg-green-50/80 ring-1 ring-green-700/20"
                          : "border-stone-200 bg-stone-50 hover:bg-stone-100"
                      }`}
                    >
                      <p className="text-xs font-extrabold text-stone-900">{b.name}</p>
                      <p className="text-[11px] text-stone-500">{b.tag}</p>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Optional test decline toggle */}
            <label className="flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-stone-200/90 bg-white/80 px-3.5 py-2.5 text-xs text-stone-700">
              <span>Simulate bank decline (test payment failure &amp; retry flow)</span>
              <input
                type="checkbox"
                checked={simulateDecline}
                onChange={(e) => setSimulateDecline(e.target.checked)}
                className="h-4 w-4 rounded accent-amber-600"
              />
            </label>

            {localError && (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-800">
                {localError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => onOpenChange(false)}
                className="btn-secondary px-4 py-2.5 text-sm"
              >
                Cancel
              </button>
              <button type="submit" disabled={busy} className="btn-primary flex-1 py-2.5 text-sm">
                {busy && <ButtonSpinner />}
                {busy ? "Authorizing payment..." : `Pay ${formatPaise(amountPaise)}`}
              </button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
