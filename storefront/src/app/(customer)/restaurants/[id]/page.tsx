"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { catalog, type MenuItem, type Restaurant } from "@/lib/api";
import { quantityOf, useCart } from "@/features/cart";
import { matchesDiet, toList, usePrefs, CertBadge, DietBadges, OpenBadge, DietSwitch } from "@/features/catalog";
import { formatDistance, formatPaise } from "@/lib/money";
import { ConfirmDialog, Empty, ErrorBox, Spinner } from "@/components/ui";

function Qty({ item, restaurant }: { item: MenuItem; restaurant: Restaurant }) {
  const { cart, add, decrement } = useCart();
  const [pending, setPending] = useState(false);
  const qty = quantityOf(cart, item.id);
  const addItem = { itemId: item.id, name: item.name, pricePaise: item.pricePaise };
  const rest = { id: restaurant.id, name: restaurant.name };

  return (
    <>
      {qty === 0 ? (
        <button
          type="button"
          disabled={!item.available}
          onClick={() => {
            if (add(rest, addItem) === "switch-needed") setPending(true);
          }}
          aria-label={`Add ${item.name} to cart`}
          className="rounded-lg border border-green-700 px-4 py-1.5 text-sm font-semibold text-green-800 hover:bg-green-50 disabled:cursor-not-allowed disabled:border-stone-300 disabled:text-stone-400 disabled:hover:bg-transparent"
        >
          Add
        </button>
      ) : (
        <div className="inline-flex items-center rounded-lg border border-green-700" role="group" aria-label={`Quantity of ${item.name}`}>
          <button
            type="button"
            onClick={() => decrement(item.id)}
            aria-label={`Remove one ${item.name}`}
            className="h-9 w-9 text-lg font-bold text-green-800 hover:bg-green-50"
          >
            -
          </button>
          <span className="min-w-8 text-center text-sm font-semibold" aria-live="polite">
            {qty}
          </span>
          <button
            type="button"
            onClick={() => add(rest, addItem)}
            aria-label={`Add one more ${item.name}`}
            className="h-9 w-9 text-lg font-bold text-green-800 hover:bg-green-50"
          >
            +
          </button>
        </div>
      )}
      <ConfirmDialog
        open={pending}
        title="Start a new cart?"
        confirmLabel="Clear and add"
        destructive
        onCancel={() => setPending(false)}
        onConfirm={() => {
          add(rest, addItem, true);
          setPending(false);
        }}
      >
        Your cart has items from {cart.restaurantName ?? "another restaurant"}. You can only order from one restaurant at a
        time. Clear your cart and add {item.name} from {restaurant.name}?
      </ConfirmDialog>
    </>
  );
}

function MenuRow({ item, restaurant }: { item: MenuItem; restaurant: Restaurant }) {
  const allergens = toList(item.containsAllergens);
  const ingredients = toList(item.ingredients);
  return (
    <li
      className={`rounded-2xl p-4 shadow-sm ring-1 ring-stone-200 transition ${
        item.available ? "bg-white hover:shadow-md" : "bg-stone-100"
      }`}
    >
      <div className={`flex items-start justify-between gap-3 ${item.available ? "" : "opacity-60"}`}>
        <div className="min-w-0 space-y-1.5">
          <DietBadges item={item} />
          <h3 className="font-semibold">
            {item.name}
            {!item.available && (
              <span className="ml-2 rounded bg-stone-300 px-1.5 py-0.5 align-middle text-xs font-medium text-stone-700">
                86&apos;d: unavailable
              </span>
            )}
          </h3>
          <p className="text-sm font-medium">{formatPaise(item.pricePaise)}</p>
          {item.description && <p className="text-sm text-stone-600">{item.description}</p>}
          {allergens.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Contains allergens">
              {allergens.map((a) => (
                <li key={a} className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800 ring-1 ring-red-200">
                  Contains {a}
                </li>
              ))}
            </ul>
          )}
          {ingredients.length > 0 && (
            <details className="text-sm text-stone-700">
              <summary className="cursor-pointer text-stone-600 underline">Ingredients</summary>
              <p className="mt-1">{ingredients.join(", ")}</p>
            </details>
          )}
        </div>
        <div className="shrink-0">
          {item.available ? <Qty item={item} restaurant={restaurant} /> : <span className="text-sm text-stone-500">Unavailable</span>}
        </div>
      </div>
    </li>
  );
}

export default function RestaurantPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { diet, setDiet } = usePrefs();
  const { count } = useCart();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    (async () => {
      const r = await catalog.restaurant(id, ctrl.signal);
      const m = Array.isArray(r.menu) ? r.menu : await catalog.menu(id, null, ctrl.signal);
      setRestaurant(r);
      setMenu(m);
      setLoading(false);
    })().catch((e: unknown) => {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e);
      setLoading(false);
    });
    return () => ctrl.abort();
  }, [id, nonce]);

  const visible = useMemo(() => menu.filter((m) => matchesDiet(m, diet)), [menu, diet]);
  const retry = useCallback(() => setNonce((n) => n + 1), []);

  if (error) return <ErrorBox error={error} onRetry={retry} />;
  if (loading || !restaurant) return <Spinner label="Loading menu" />;

  return (
    <div className="space-y-4">
      <Link href="/" className="text-sm text-green-800 underline">
        &larr; All restaurants
      </Link>
      <header className="space-y-2 rounded-3xl bg-gradient-to-br from-green-600 to-emerald-700 p-5 text-white shadow-md">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-extrabold sm:text-3xl">{restaurant.name}</h1>
          <OpenBadge open={restaurant.open} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-green-50">
          {restaurant.distanceMeters != null && <span>{formatDistance(restaurant.distanceMeters)} away</span>}
          <CertBadge level={restaurant.kitchenCertificationLevel} />
        </div>
        {!restaurant.open && (
          <p role="status" className="rounded bg-amber-50 p-2 text-sm text-amber-900">
            This restaurant is currently closed. The server may reject new orders.
          </p>
        )}
      </header>

      <DietSwitch value={diet} onChange={setDiet} />

      {visible.length === 0 ? (
        <Empty>No dishes here match this diet filter.</Empty>
      ) : (
        <ul className="space-y-3">
          {visible.map((m) => (
            <MenuRow key={m.id} item={m} restaurant={restaurant} />
          ))}
        </ul>
      )}

      {count > 0 && (
        <div className="sticky bottom-3">
          <Link
            href="/cart"
            className="block rounded-2xl bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-3.5 text-center font-semibold text-white shadow-lg hover:from-green-700 hover:to-emerald-700"
          >
            View cart ({count} {count === 1 ? "item" : "items"})
          </Link>
        </div>
      )}
    </div>
  );
}
