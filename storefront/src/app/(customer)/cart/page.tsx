"use client";

import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/features/auth";
import { cartAllergens, cartDietConflicts, estimatedSubtotalPaise, useCart } from "@/features/cart";
import { dietLabel, usePrefs } from "@/features/catalog";
import {
  computeCustomerGroupOrderPricing,
  DEFAULT_ORG_CUSTOMER_GROUP_RULES,
  DIETARY_COHORT_META,
  LOYALTY_TIER_META,
} from "@/features/customer-groups";
import { formatPaise } from "@/lib/money";
import { Empty, Spinner } from "@/components/ui";

export default function CartPage() {
  const { ready, cart, add, decrement, remove, clear } = useCart();
  const { diet } = usePrefs();
  const { me } = useAuth();

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
  const subtotalPaise = estimatedSubtotalPaise(cart);
  const groupPricing = me?.customerGroup
    ? computeCustomerGroupOrderPricing(
        subtotalPaise,
        me.customerGroup.loyaltyTier,
        me.orgRules ?? DEFAULT_ORG_CUSTOMER_GROUP_RULES,
      )
    : null;

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
              <p className="text-sm text-stone-600">{formatPaise(l.pricePaise)} each</p>
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
        {me?.customerGroup && groupPricing && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-sm text-emerald-950">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold">
                Veggo Pass: {LOYALTY_TIER_META[me.customerGroup.loyaltyTier].label}
              </span>
              <span className="rounded-md bg-white px-2 py-0.5 text-xs font-semibold text-emerald-900">
                Dietary Profile: {DIETARY_COHORT_META[me.customerGroup.dietaryCohort].label}
              </span>
            </div>
            <p className="mt-1 text-xs text-emerald-800">
              {groupPricing.appliedRuleSummary} · Delivery fee:{" "}
              <strong>{groupPricing.deliveryFeePaise === 0 ? "FREE" : formatPaise(groupPricing.deliveryFeePaise)}</strong>
            </p>
          </div>
        )}
        <div className="flex justify-between text-lg font-bold">
          <span>Item subtotal</span>
          <span>{formatPaise(subtotalPaise)}</span>
        </div>
        {allergens.length > 0 && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <strong>Allergen summary:</strong> Items in your cart contain <strong>{allergens.join(", ")}</strong>.
          </p>
        )}
        <p className="text-sm text-stone-600">
          Taxes (5% GST) and delivery charges are calculated at checkout before payment.
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
