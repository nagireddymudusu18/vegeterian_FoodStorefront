"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { errorMessage, orders, payments, type Order } from "@/lib/api";
import { cartAllergens, cartDietConflicts, estimatedSubtotalPaise, toOrderLines, type Cart, useCart } from "@/features/cart";
import { dietLabel, openLocationPickerModal, usePrefs } from "@/features/catalog";
import { formatPaise } from "@/lib/money";
import { OtpLogin, useAuth } from "@/features/auth";
import { useFlag } from "@/features/flags";
import { ErrorBox, Spinner } from "@/components/ui";

const KEY = "sf.checkout.v1";

/** Persisted per checkout attempt so a refresh / double-click / network retry reuses the same keys. */
interface Attempt {
  signature: string;
  orderKey: string;
  order?: { id: string; totalPaise: number };
  payKey?: string;
}

function signature(cart: Cart): string {
  return JSON.stringify([cart.restaurantId, cart.lines.map((l) => [l.itemId, l.quantity])]);
}

function loadAttempt(sig: string): Attempt {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw) {
      const a = JSON.parse(raw) as Attempt;
      if (a.signature === sig && typeof a.orderKey === "string") return a;
    }
  } catch {
    /* ignore */
  }
  return { signature: sig, orderKey: crypto.randomUUID() };
}

function saveAttempt(a: Attempt | null) {
  try {
    if (a) window.sessionStorage.setItem(KEY, JSON.stringify(a));
    else window.sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

function isPaymentFailure(status: string | undefined): boolean {
  return !!status && /FAIL|DECLIN|ERROR|REJECT/i.test(status);
}

const COOKING_PRESETS = [
  "Jain prep: no onion or garlic",
  "Less spicy",
  "No green chillies",
  "Don't send disposable cutlery",
];

type Phase = "idle" | "creating" | "paying" | "payment-failed";

export default function CheckoutPage() {
  const router = useRouter();
  const auth = useAuth();
  const guestAllowed = useFlag("guest_checkout");
  const { ready, cart, clear } = useCart();
  const { diet, location, setLocation, savedAddresses } = usePrefs();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<unknown>(null);
  const [placed, setPlaced] = useState<Order | null>(null);
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [cookingInstructions, setCookingInstructions] = useState("");
  const attempt = useRef<Attempt | null>(null);
  const busy = useRef(false);

  // Match active saved address if coordinates match
  const activeSavedAddr = savedAddresses.find(
    (a) => Math.abs(a.lat - location.lat) < 0.0005 && Math.abs(a.lng - location.lng) < 0.0005,
  );

  useEffect(() => {
    if (ready && cart.lines.length > 0) attempt.current = loadAttempt(signature(cart));
  }, [ready, cart]);

  if (!ready || auth.status === "loading") return <Spinner label="Preparing checkout" />;

  if (cart.lines.length === 0 || !cart.restaurantId) {
    return (
      <div className="rounded-lg border border-dashed border-stone-300 p-8 text-center">
        <p className="mb-3">Nothing to check out.</p>
        <Link href="/" className="font-medium text-green-800 underline">
          Browse restaurants
        </Link>
      </div>
    );
  }
  const restaurantId = cart.restaurantId;

  const formattedDeliveryAddress = (() => {
    const base = activeSavedAddr
      ? `${activeSavedAddr.label}: ${activeSavedAddr.building}${activeSavedAddr.landmark ? ` (${activeSavedAddr.landmark})` : ""}, ${activeSavedAddr.areaLabel}`
      : location.label;
    return deliveryNotes.trim() ? `${base} — ${deliveryNotes.trim()}` : base;
  })().slice(0, 200);

  const pay = async (a: Attempt) => {
    if (!a.order) return;
    setPhase("paying");
    setError(null);
    a.payKey ??= crypto.randomUUID();
    saveAttempt(a);
    try {
      const p = await payments.create(a.order.id, a.order.totalPaise, a.payKey);
      if (isPaymentFailure(p.status)) {
        setError(new Error(`Payment ${p.status.toLowerCase()}. You have not been charged.`));
        setPhase("payment-failed");
        return;
      }
      saveAttempt(null);
      clear();
      router.replace(`/orders/${encodeURIComponent(a.order.id)}`);
    } catch (e) {
      setError(e);
      setPhase("payment-failed");
    }
  };

  const place = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const a = attempt.current ?? loadAttempt(signature(cart));
      attempt.current = a;
      setError(null);
      if (!a.order) {
        setPhase("creating");
        try {
          const o = await orders.create(restaurantId, toOrderLines(cart), a.orderKey, {
            deliveryAddress: formattedDeliveryAddress,
            cookingInstructions: cookingInstructions.trim() || undefined,
          });
          setPlaced(o);
          a.order = { id: o.id, totalPaise: o.totalPaise };
          saveAttempt(a);
        } catch (e) {
          // Keep the same Idempotency-Key so a network retry cannot create a duplicate order.
          setError(e);
          setPhase("idle");
          return;
        }
      }
      await pay(a);
    } finally {
      busy.current = false;
    }
  };

  const retryPayment = async () => {
    const a = attempt.current;
    if (!a?.order || busy.current) return;
    busy.current = true;
    try {
      a.payKey = crypto.randomUUID(); // new payment attempt = new key
      await pay(a);
    } finally {
      busy.current = false;
    }
  };

  const startOver = () => {
    saveAttempt(null);
    attempt.current = { signature: signature(cart), orderKey: crypto.randomUUID() };
    setPlaced(null);
    setError(null);
    setPhase("idle");
  };

  const toggleCookingPreset = (preset: string) => {
    setCookingInstructions((cur) => {
      if (cur.includes(preset)) {
        return cur
          .split(" · ")
          .filter((p) => p !== preset)
          .join(" · ");
      }
      return cur ? `${cur} · ${preset}`.slice(0, 200) : preset;
    });
  };

  const guest = auth.status !== "authed";
  const working = phase === "creating" || phase === "paying";
  const total = attempt.current?.order?.totalPaise ?? placed?.totalPaise;
  const conflicts = cartDietConflicts(cart, diet);
  const allergens = cartAllergens(cart);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Checkout</h1>
        <p className="mt-1 text-stone-700">
          Order from <span className="font-semibold">{cart.restaurantName}</span>
        </p>
      </div>

      {conflicts.length > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <span>
            <strong>Dietary check:</strong> {conflicts.map((c) => c.name).join(", ")}{" "}
            {conflicts.some((c) => c.isPureVeg === false)
              ? "includes non-vegetarian ingredients."
              : `does not match your ${dietLabel(diet)} filter.`}
          </span>
          <Link href="/cart" className="shrink-0 font-semibold text-green-800 underline">
            Edit cart
          </Link>
        </div>
      )}

      {/* Delivery Spot & Saved Address Selector */}
      <section className="card space-y-3 p-4" aria-labelledby="chk-addr-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="chk-addr-h" className="text-sm font-bold text-stone-900">
              Delivering to
            </h2>
            <p className="text-sm font-semibold text-[#1B5E3A]">{formattedDeliveryAddress}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openLocationPickerModal()}
              className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-100"
            >
              Change map pin
            </button>
            <Link
              href="/profile"
              className="rounded-lg border border-[#1B5E3A]/30 bg-[#1B5E3A]/5 px-2.5 py-1.5 text-xs font-bold text-[#1B5E3A] hover:bg-[#1B5E3A]/10"
            >
              Manage saved addresses
            </Link>
          </div>
        </div>

        {savedAddresses.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label="Saved addresses">
            {savedAddresses.map((addr) => {
              const active = activeSavedAddr?.id === addr.id;
              return (
                <button
                  key={addr.id}
                  type="button"
                  onClick={() => {
                    setLocation({
                      lat: addr.lat,
                      lng: addr.lng,
                      label: `${addr.label} · ${addr.areaLabel}`,
                    });
                    toast.success(`Delivering to ${addr.label}`);
                  }}
                  className={`rounded-xl border px-3 py-1.5 text-left text-xs transition ${
                    active
                      ? "border-[#1B5E3A] bg-[#1B5E3A] font-bold text-white"
                      : "border-stone-300 bg-stone-50 font-medium text-stone-800 hover:bg-stone-100"
                  }`}
                >
                  <span className="font-bold">{addr.label}:</span> {addr.building}
                </button>
              );
            })}
          </div>
        )}

        <input
          type="text"
          maxLength={120}
          value={deliveryNotes}
          onChange={(e) => setDeliveryNotes(e.target.value)}
          placeholder="Door / flat number, floor, or gate drop instructions (optional)"
          aria-label="Door, flat, or delivery drop instructions"
          className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
        />
      </section>

      {/* Kitchen Cooking & Dietary Instructions */}
      <section className="card space-y-3 p-4" aria-labelledby="chk-notes-h">
        <div>
          <h2 id="chk-notes-h" className="text-sm font-bold text-stone-900">
            Cooking &amp; dietary instructions for the kitchen
          </h2>
          <p className="text-xs text-stone-600">
            Shared directly on the kitchen preparation ticket.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick cooking instructions">
          {COOKING_PRESETS.map((preset) => {
            const active = cookingInstructions.includes(preset);
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={active}
                onClick={() => toggleCookingPreset(preset)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  active
                    ? "border-[#1B5E3A] bg-[#1B5E3A] text-white"
                    : "border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                }`}
              >
                {active ? `✓ ${preset}` : `+ ${preset}`}
              </button>
            );
          })}
        </div>
        <input
          type="text"
          maxLength={200}
          value={cookingInstructions}
          onChange={(e) => setCookingInstructions(e.target.value)}
          placeholder="E.g. Jain preparation, no ginger/garlic, pack chutney separately"
          aria-label="Cooking instructions for the kitchen"
          className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
        />
      </section>

      <div className="card overflow-hidden">
        <ul className="divide-y divide-stone-200">
          {cart.lines.map((l) => (
            <li key={l.itemId} className="flex justify-between gap-3 p-4 text-sm">
              <span>
                <span className="font-bold">{l.quantity} x</span> {l.name}
                {l.isPureVeg === false && (
                  <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-800">Non-veg</span>
                )}
              </span>
              <span className="font-semibold">{formatPaise(l.pricePaise * l.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="space-y-2 border-t border-stone-200 bg-stone-50 p-4 text-sm">
          <div className="flex justify-between font-semibold">
            <span>Estimated subtotal</span>
            <span>{formatPaise(estimatedSubtotalPaise(cart))}</span>
          </div>
          {allergens.length > 0 && (
            <p className="text-xs text-amber-900">
              Allergens in order: <strong>{allergens.join(", ")}</strong>
            </p>
          )}
          {total !== undefined ? (
            <div className="flex justify-between text-base font-bold">
              <span>Total confirmed by server</span>
              <span>{formatPaise(total)}</span>
            </div>
          ) : (
            <p className="text-stone-600">
              The final total (including 5% GST and ₹30 delivery fee) is calculated by the server when you place the order.
            </p>
          )}
        </div>
      </div>

      {guest && (
        <section aria-labelledby="guest-title" className="card p-5">
          <h2 id="guest-title" className="text-lg font-bold">
            Continue as guest
          </h2>
          <p className="mb-4 mt-1 text-sm text-stone-600">
            No account needed. We verify your phone with an OTP, then you can place the order and track it with your order number.
          </p>
          {guestAllowed ? (
            <OtpLogin askName submitLabel="Verify and continue" onDone={() => undefined} />
          ) : (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              Guest checkout is switched off right now. Please sign in to place your order.
            </p>
          )}
          <p className="mt-4 text-center text-sm text-stone-600">
            Already have an account?{" "}
            <Link href="/login?next=/checkout" className="font-semibold text-green-800 underline">
              Sign in
            </Link>
          </p>
        </section>
      )}

      {error !== null && phase !== "payment-failed" && <ErrorBox error={error} />}

      {phase === "payment-failed" && (
        <div role="alert" className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">Payment failed</p>
          <p>{errorMessage(error)}</p>
          <p>Your order has been created. You can retry the payment, or start over with a new order.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={retryPayment} className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white hover:bg-red-800">
              Retry payment
            </button>
            <button type="button" onClick={startOver} className="rounded-lg border border-red-300 px-4 py-2 font-medium hover:bg-red-100">
              Start over
            </button>
          </div>
        </div>
      )}

      {phase !== "payment-failed" && !guest && (
        <button
          type="button"
          onClick={place}
          disabled={working}
          className="btn-primary w-full text-lg"
        >
          {phase === "creating" ? "Placing order..." : phase === "paying" ? "Processing payment..." : "Place order and pay"}
        </button>
      )}
      <p className="text-center text-xs text-stone-500">
        <Link href="/cart" className="underline">
          Back to cart
        </Link>
      </p>
    </div>
  );
}
