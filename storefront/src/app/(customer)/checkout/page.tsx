"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { errorMessage, orders, payments, type Order } from "@/lib/api";
import { estimatedSubtotalPaise, toOrderLines, type Cart, useCart } from "@/features/cart";
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

type Phase = "idle" | "creating" | "paying" | "payment-failed";

export default function CheckoutPage() {
  const router = useRouter();
  const auth = useAuth();
  const guestAllowed = useFlag("guest_checkout");
  const { ready, cart, clear } = useCart();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<unknown>(null);
  const [placed, setPlaced] = useState<Order | null>(null);
  const attempt = useRef<Attempt | null>(null);
  const busy = useRef(false);

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
          const o = await orders.create(restaurantId, toOrderLines(cart), a.orderKey);
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

  const guest = auth.status !== "authed";
  const working = phase === "creating" || phase === "paying";
  const total = attempt.current?.order?.totalPaise ?? placed?.totalPaise;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Checkout</h1>
      <p className="text-stone-700">
        Order from <span className="font-semibold">{cart.restaurantName}</span>
      </p>

      <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
        {cart.lines.map((l) => (
          <li key={l.itemId} className="flex justify-between p-3 text-sm">
            <span>
              {l.quantity} x {l.name}
            </span>
            <span>{formatPaise(l.pricePaise * l.quantity)}</span>
          </li>
        ))}
      </ul>

      <div className="rounded-xl border border-stone-200 bg-white p-4 text-sm">
        <div className="flex justify-between font-semibold">
          <span>Estimated subtotal</span>
          <span>{formatPaise(estimatedSubtotalPaise(cart))}</span>
        </div>
        {total !== undefined ? (
          <div className="mt-2 flex justify-between text-base font-bold">
            <span>Total confirmed by server</span>
            <span>{formatPaise(total)}</span>
          </div>
        ) : (
          <p className="mt-2 text-stone-600">
            The final total (including tax and delivery) is calculated by the server when you place the order.
          </p>
        )}
      </div>

      {guest && (
        <section aria-labelledby="guest-title" className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
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
          className="w-full rounded-xl bg-green-700 px-4 py-3 text-lg font-semibold text-white hover:bg-green-800 disabled:opacity-60"
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
