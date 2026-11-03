"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { catalog, type MenuItem, type Restaurant } from "@/lib/api";
import { estimatedSubtotalPaise, quantityOf, useCart } from "@/features/cart";
import { matchesDiet, toList, usePrefs, CertBadge, DietBadges, OpenBadge, DietSwitch } from "@/features/catalog";
import { formatDistance, formatPaise } from "@/lib/money";
import { ConfirmDialog, Empty, ErrorBox } from "@/components/ui";
import { MenuSkeleton } from "@/components/Skeletons";
import { FadeInItem } from "@/components/motion";

function Qty({ item, restaurant }: { item: MenuItem; restaurant: Restaurant }) {
  const { cart, add, decrement } = useCart();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const qty = quantityOf(cart, item.id);
  const addItem = { itemId: item.id, name: item.name, pricePaise: item.pricePaise };
  const rest = { id: restaurant.id, name: restaurant.name };
  const notifyAdded = (message: string) =>
    toast.success(message, { action: { label: "View cart", onClick: () => router.push("/cart") } });

  return (
    <>
      {qty === 0 ? (
        <button
          type="button"
          disabled={!item.available}
          onClick={() => {
            if (add(rest, addItem) === "switch-needed") setPending(true);
            else notifyAdded(`${item.name} added to cart`);
          }}
          aria-label={`Add ${item.name} to cart`}
          className="rounded-xl border border-green-700 bg-white px-5 py-2 text-sm font-bold text-green-800 hover:bg-green-50 disabled:cursor-not-allowed disabled:border-stone-300 disabled:text-stone-400 disabled:hover:bg-transparent"
        >
          Add
        </button>
      ) : (
        <div className="inline-flex items-center rounded-xl bg-green-700 text-white" role="group" aria-label={`Quantity of ${item.name}`}>
          <button
            type="button"
            onClick={() => decrement(item.id)}
            aria-label={`Remove one ${item.name}`}
            className="h-10 w-10 rounded-l-xl text-lg font-bold hover:bg-green-800"
          >
            -
          </button>
          <span className="min-w-7 text-center text-sm font-bold" aria-live="polite">
            {qty}
          </span>
          <button
            type="button"
            onClick={() => add(rest, addItem)}
            aria-label={`Add one more ${item.name}`}
            className="h-10 w-10 rounded-r-xl text-lg font-bold hover:bg-green-800"
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
          notifyAdded(`Started a new cart with ${item.name}`);
        }}
      >
        Your cart has items from {cart.restaurantName ?? "another restaurant"}. You can only order from one restaurant at a
        time. Clear your cart and add {item.name} from {restaurant.name}?
      </ConfirmDialog>
    </>
  );
}

function MenuRow({ item, restaurant, index }: { item: MenuItem; restaurant: Restaurant; index: number }) {
  const allergens = toList(item.containsAllergens);
  const ingredients = toList(item.ingredients);
  return (
    <FadeInItem
      index={index}
      className={`rounded-2xl p-4 ring-1 ring-stone-200 transition-shadow ${
        item.available ? "bg-white hover:shadow-md" : "bg-stone-100"
      }`}
    >
      <div className={`flex items-start justify-between gap-3 ${item.available ? "" : "opacity-60"}`}>
        <div className="min-w-0 space-y-1.5">
          <DietBadges item={item} />
          <h3 className="font-bold leading-snug">
            {item.name}
            {!item.available && (
              <span className="ml-2 rounded bg-stone-300 px-1.5 py-0.5 align-middle text-xs font-medium text-stone-700">
                86&apos;d: unavailable
              </span>
            )}
          </h3>
          <p className="text-sm font-semibold">{formatPaise(item.pricePaise)}</p>
          {item.description && <p className="text-sm leading-snug text-stone-600">{item.description}</p>}
          {allergens.length > 0 && (
            <p className="text-xs text-stone-600">
              Contains <strong className="font-semibold text-amber-800">{allergens.join(", ")}</strong>
            </p>
          )}
          {ingredients.length > 0 && (
            <details className="text-xs text-stone-700">
              <summary className="cursor-pointer text-stone-600 underline">Ingredients</summary>
              <p className="mt-1">{ingredients.join(", ")}</p>
            </details>
          )}
        </div>
        <div className="shrink-0">
          {item.available ? <Qty item={item} restaurant={restaurant} /> : <span className="text-sm text-stone-500">Unavailable</span>}
        </div>
      </div>
    </FadeInItem>
  );
}

export default function RestaurantPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { diet, setDiet } = usePrefs();
  const { count, cart } = useCart();
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
  if (loading || !restaurant) return <MenuSkeleton />;

  return (
    <div className="space-y-4">
      <Link href="/" className="text-sm text-green-800 underline">
        &larr; All restaurants
      </Link>
      <header className="relative space-y-2 overflow-hidden rounded-3xl bg-gradient-to-br from-green-700 to-green-600 p-5 text-white shadow-md sm:p-7">
        <span aria-hidden="true" className="pointer-events-none absolute right-5 top-5 h-10 w-10 rounded-full bg-amber-500 sm:-right-6 sm:-top-8 sm:h-32 sm:w-32" />
        <div className="relative flex flex-wrap items-center gap-2 pr-14 sm:pr-0">
          <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">{restaurant.name}</h1>
          <OpenBadge open={restaurant.open} />
        </div>
        <div className="relative flex flex-wrap items-center gap-2 text-sm text-green-50">
          {restaurant.distanceMeters != null && <span>{formatDistance(restaurant.distanceMeters)} away</span>}
          <CertBadge level={restaurant.kitchenCertificationLevel} />
        </div>
        {!restaurant.open && (
          <p role="status" className="relative rounded bg-amber-50 p-2 text-sm text-amber-900">
            This restaurant is currently closed. The server may reject new orders.
          </p>
        )}
      </header>

      <DietSwitch value={diet} onChange={setDiet} />

      {visible.length === 0 ? (
        <Empty>No dishes here match this diet filter.</Empty>
      ) : (
        <ul className="space-y-3">
          {visible.map((m, i) => (
            <MenuRow key={m.id} item={m} restaurant={restaurant} index={i} />
          ))}
        </ul>
      )}

      {count > 0 && (
        <div className="sticky bottom-3 z-20">
          <Link
            href="/cart"
            className="flex items-center justify-between rounded-2xl bg-green-700 px-5 py-3.5 font-semibold text-white shadow-lg hover:bg-green-800"
          >
            <span>
              {count} {count === 1 ? "item" : "items"} · {formatPaise(estimatedSubtotalPaise(cart))}
            </span>
            <span>View cart &rarr;</span>
          </Link>
        </div>
      )}
    </div>
  );
}
