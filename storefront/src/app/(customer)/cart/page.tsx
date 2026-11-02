"use client";

import Link from "next/link";
import { toast } from "sonner";
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
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Your cart</h1>
        <p className="mt-1 text-stone-700">
          From{" "}
          <Link href={`/restaurants/${encodeURIComponent(cart.restaurantId)}`} className="font-semibold text-green-800 underline">
            {restaurant.name}
          </Link>
        </p>
      </div>

      <ul className="card divide-y divide-stone-200">
        {cart.lines.map((l) => (
          <li key={l.itemId} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="font-bold leading-snug">{l.name}</p>
              <p className="text-sm text-stone-600">{formatPaise(l.pricePaise)} each (estimate)</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center rounded-xl bg-green-700 text-white" role="group" aria-label={`Quantity of ${l.name}`}>
                <button
                  type="button"
                  onClick={() => decrement(l.itemId)}
                  aria-label={`Remove one ${l.name}`}
                  className="h-10 w-10 rounded-l-xl text-lg font-bold hover:bg-green-800"
                >
                  -
                </button>
                <span className="min-w-7 text-center text-sm font-bold" aria-live="polite">
                  {l.quantity}
                </span>
                <button
                  type="button"
                  onClick={() => add(restaurant, { itemId: l.itemId, name: l.name, pricePaise: l.pricePaise })}
                  aria-label={`Add one more ${l.name}`}
                  className="h-10 w-10 rounded-r-xl text-lg font-bold hover:bg-green-800"
                >
                  +
                </button>
              </div>
              <span className="w-24 text-right font-medium">{formatPaise(l.pricePaise * l.quantity)}</span>
              <button
                type="button"
                onClick={() => {
                  remove(l.itemId);
                  toast(`Removed ${l.name}`, {
                    action: {
                      label: "Undo",
                      onClick: () => {
                        for (let i = 0; i < l.quantity; i++) {
                          add(restaurant, { itemId: l.itemId, name: l.name, pricePaise: l.pricePaise });
                        }
                      },
                    },
                  });
                }}
                aria-label={`Remove ${l.name} from cart`}
                className="text-sm text-red-700 underline"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="card space-y-4 p-5">
        <div className="flex justify-between text-lg font-bold">
          <span>Estimated subtotal</span>
          <span>{formatPaise(estimatedSubtotalPaise(cart))}</span>
        </div>
        <p className="text-sm text-stone-600">
          This is an estimate based on prices we last saw. Tax, delivery fee and the final price are calculated and
          confirmed by the server when you place your order.
        </p>
        <Link href="/checkout" className="btn-primary w-full">
          Proceed to checkout
        </Link>
        <p className="text-center text-sm text-stone-600">No account needed: you can check out as a guest with a phone OTP.</p>
      </div>

      <div className="text-center">
        <button
          type="button"
          onClick={() => {
            clear();
            toast("Cart cleared");
          }}
          className="text-sm font-semibold text-stone-600 underline hover:text-ink"
        >
          Clear cart
        </button>
      </div>
    </div>
  );
}
