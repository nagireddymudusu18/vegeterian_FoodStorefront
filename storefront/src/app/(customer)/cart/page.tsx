"use client";

import Link from "next/link";
import { estimatedSubtotalPaise, useCart } from "@/features/cart";
import { formatPaise } from "@/lib/money";
import { Empty, Spinner } from "@/components/ui";

export default function CartPage() {
  const { ready, cart, add, decrement, remove, clear } = useCart();

  if (!ready) return <Spinner label="Loading cart" />;

  if (cart.lines.length === 0 || !cart.restaurantId) {
    return (
      <Empty>
        <p className="mb-3">Your cart is empty.</p>
        <Link href="/" className="font-medium text-green-800 underline">
          Browse restaurants
        </Link>
      </Empty>
    );
  }

  const restaurant = { id: cart.restaurantId, name: cart.restaurantName ?? "Restaurant" };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Your cart</h1>
      <p className="text-stone-700">
        From{" "}
        <Link href={`/restaurants/${encodeURIComponent(cart.restaurantId)}`} className="font-semibold text-green-800 underline">
          {restaurant.name}
        </Link>
      </p>

      <ul className="divide-y divide-stone-200 rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
        {cart.lines.map((l) => (
          <li key={l.itemId} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="font-medium">{l.name}</p>
              <p className="text-sm text-stone-600">{formatPaise(l.pricePaise)} each (estimate)</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center rounded-lg border border-stone-300" role="group" aria-label={`Quantity of ${l.name}`}>
                <button
                  type="button"
                  onClick={() => decrement(l.itemId)}
                  aria-label={`Remove one ${l.name}`}
                  className="h-9 w-9 text-lg font-bold hover:bg-stone-100"
                >
                  -
                </button>
                <span className="min-w-8 text-center text-sm font-semibold" aria-live="polite">
                  {l.quantity}
                </span>
                <button
                  type="button"
                  onClick={() => add(restaurant, { itemId: l.itemId, name: l.name, pricePaise: l.pricePaise })}
                  aria-label={`Add one more ${l.name}`}
                  className="h-9 w-9 text-lg font-bold hover:bg-stone-100"
                >
                  +
                </button>
              </div>
              <span className="w-24 text-right font-medium">{formatPaise(l.pricePaise * l.quantity)}</span>
              <button
                type="button"
                onClick={() => remove(l.itemId)}
                aria-label={`Remove ${l.name} from cart`}
                className="text-sm text-red-700 underline"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="flex justify-between text-lg font-semibold">
          <span>Estimated subtotal</span>
          <span>{formatPaise(estimatedSubtotalPaise(cart))}</span>
        </div>
        <p className="mt-2 text-sm text-stone-600">
          This is an estimate based on prices we last saw. Tax, delivery fee and the final price are calculated and
          confirmed by the server when you place your order.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/checkout"
          className="flex-1 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-3 text-center font-semibold text-white shadow-sm hover:from-green-700 hover:to-emerald-700 sm:flex-none"
        >
          Proceed to checkout
        </Link>
        <p className="w-full text-sm text-stone-600">No account needed: you can check out as a guest with a phone OTP.</p>
        <button type="button" onClick={clear} className="rounded-xl border border-stone-300 px-4 py-3 font-medium hover:bg-stone-100">
          Clear cart
        </button>
      </div>
    </div>
  );
}
