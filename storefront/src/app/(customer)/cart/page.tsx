"use client";

import Link from "next/link";
import { toast } from "sonner";
import { cartAllergens, cartDietConflicts, estimatedSubtotalPaise, useCart } from "@/features/cart";
import { dietLabel, usePrefs } from "@/features/catalog";
import { formatPaise } from "@/lib/money";
import { Empty, Spinner } from "@/components/ui";

export default function CartPage() {
  const { ready, cart, add, decrement, remove, clear } = useCart();
  const { diet } = usePrefs();

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
  const conflicts = cartDietConflicts(cart, diet);
  const allergens = cartAllergens(cart);

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

      {conflicts.length > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <div className="space-y-0.5">
            <p className="font-bold">
              Dietary check ({diet === "ALL" ? "Non-veg item in cart" : `${dietLabel(diet)} filter active`})
            </p>
            <p>
              {conflicts.map((c) => c.name).join(", ")}{" "}
              {conflicts.some((c) => c.isPureVeg === false)
                ? "includes non-vegetarian ingredients."
                : `does not match your ${dietLabel(diet)} filter.`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              for (const c of conflicts) remove(c.itemId);
              toast("Removed non-matching items from cart");
            }}
            className="shrink-0 rounded-xl border border-amber-800 bg-white px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100"
          >
            Remove {conflicts.length === 1 ? "item" : `${conflicts.length} items`}
          </button>
        </div>
      )}

      <ul className="card divide-y divide-stone-200">
        {cart.lines.map((l) => (
          <li key={l.itemId} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold leading-snug">{l.name}</p>
                {l.isPureVeg === false && (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-800">Non-veg</span>
                )}
              </div>
              <p className="text-sm text-stone-600">{formatPaise(l.pricePaise)} each (estimate)</p>
              {l.containsAllergens && l.containsAllergens.length > 0 && (
                <p className="text-xs text-stone-600">
                  Contains <strong className="font-semibold text-amber-800">{l.containsAllergens.join(", ")}</strong>
                </p>
              )}
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
                  onClick={() => add(restaurant, l)}
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
                          add(restaurant, l);
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
        {allergens.length > 0 && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <strong>Allergen summary:</strong> Items in your cart contain <strong>{allergens.join(", ")}</strong>.
          </p>
        )}
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
