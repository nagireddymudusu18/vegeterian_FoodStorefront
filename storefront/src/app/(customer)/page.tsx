"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { catalog, type Restaurant } from "@/lib/api";
import {
  DIET_OPTIONS,
  dietParam,
  usePrefs,
  certificationTier,
  CertBadge,
  OpenBadge,
  LocationPicker,
  openLocationPickerModal,
  MapPinSvg,
  RestaurantCoverAsset,
  CURATED_CULINARY_ASSETS,
} from "@/features/catalog";
import { Empty, ErrorBox } from "@/components/ui";
import { RestaurantGridSkeleton } from "@/components/Skeletons";
import { FadeInItem } from "@/components/motion";
import { StarRatingDisplay } from "@/features/reviews/RestaurantReviewsSection";

function RestaurantCard({ r, index }: { r: Restaurant; index: number }) {
  return (
    <FadeInItem index={index}>
      <Link
        href={`/restaurants/${encodeURIComponent(r.id)}`}
        className={`group block overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-stone-200 transition hover:-translate-y-0.5 hover:shadow-lg ${
          r.open ? "" : "opacity-75"
        }`}
      >
        <RestaurantCoverAsset restaurant={r} heightClass="h-44" showDistance />
        <div className="space-y-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-bold leading-snug text-ink transition-colors group-hover:text-green-800">
              {r.name}
            </h3>
            <OpenBadge open={r.open} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-stone-600">
            {r.cuisine && <span>{r.cuisine}</span>}
            {r.ratingSummary && (
              <StarRatingDisplay
                rating={r.ratingSummary.averageRating}
                count={r.ratingSummary.reviewCount}
                size="sm"
              />
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <CertBadge level={r.kitchenCertificationLevel} />
            {r.ratingSummary && r.ratingSummary.topTags.length > 0 && (
              <span className="truncate text-[11px] font-medium text-stone-500">
                {r.ratingSummary.topTags[0].tag}
              </span>
            )}
          </div>
        </div>
      </Link>
    </FadeInItem>
  );
}

type Quick = "open" | "top-rated" | "tier1" | "tier2" | "near";

const QUICK: { id: Quick; label: string; test: (r: Restaurant) => boolean }[] = [
  { id: "open", label: "Open now", test: (r) => r.open },
  {
    id: "top-rated",
    label: "4.5★+ Top rated",
    test: (r) => (r.ratingSummary?.averageRating ?? 0) >= 4.5,
  },
  { id: "tier1", label: "Exclusive veg kitchens", test: (r) => certificationTier(r.kitchenCertificationLevel) === 1 },
  { id: "tier2", label: "Segregated veg kitchens", test: (r) => certificationTier(r.kitchenCertificationLevel) === 2 },
  { id: "near", label: "Within 3 km", test: (r) => r.distanceMeters !== undefined && r.distanceMeters <= 3000 },
];

export default function HomePage() {
  const { ready, location, diet, setDiet } = usePrefs();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [items, setItems] = useState<Restaurant[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [quick, setQuick] = useState<Quick | null>(null);
  const [cuisine, setCuisine] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!ready) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    catalog
      .restaurants({ lat: location.lat, lng: location.lng, diet: dietParam(diet), q: debouncedQ || undefined }, ctrl.signal)
      .then((r) => {
        setItems(Array.isArray(r) ? r : []);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e);
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [ready, location.lat, location.lng, diet, debouncedQ, nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  const cuisines = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of items ?? []) if (r.cuisine) counts.set(r.cuisine, (counts.get(r.cuisine) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
  }, [items]);

  // A cuisine that no longer appears (after a diet or location change) must not leave an empty list behind.
  const activeCuisine = cuisine && cuisines.includes(cuisine) ? cuisine : null;

  const visible = useMemo(() => {
    const test = QUICK.find((c) => c.id === quick)?.test;
    const byQuick = test ? (items ?? []).filter(test) : (items ?? []);
    const filtered = activeCuisine ? byQuick.filter((r) => r.cuisine === activeCuisine) : byQuick;
    if (quick === "top-rated") {
      return [...filtered].sort(
        (a, b) => (b.ratingSummary?.wilsonScore ?? 0) - (a.ratingSummary?.wilsonScore ?? 0),
      );
    }
    return filtered;
  }, [items, quick, activeCuisine]);

  return (
    <div className="space-y-8">
      <section
        aria-labelledby="hero-h"
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-green-800 via-green-700 to-green-600 px-5 py-7 text-white shadow-md sm:px-10 sm:py-10"
      >
        <div className="relative grid items-center gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-300 sm:text-sm">
              Pure veg · Vegan · Jain
            </p>
            <h1 id="hero-h" className="mt-2 max-w-xl text-4xl font-extrabold leading-[1.05] sm:text-6xl">
              Veg, on the go.
            </h1>
            <p className="mt-3 max-w-md text-green-50">
              Every kitchen is checked for its veg standard, so you can order with confidence.
            </p>
            <div className="mt-5 max-w-xl">
              <label htmlFor="search" className="sr-only">
                Search restaurants
              </label>
              <input
                id="search"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search restaurants, masala dosa, tofu tikka, Jain bhaji..."
                className="w-full rounded-full border-0 bg-white px-5 py-3.5 text-ink shadow-md placeholder:text-stone-500"
              />
            </div>
          </div>

          <div className="hidden lg:col-span-5 lg:grid lg:grid-cols-2 lg:gap-3">
            {CURATED_CULINARY_ASSETS.slice(0, 2).map((asset) => (
              <div
                key={asset.id}
                className="group relative h-36 overflow-hidden rounded-2xl ring-2 ring-white/25 shadow-md"
              >
                <img
                  src={asset.src}
                  alt={asset.alt}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
                <span className="absolute bottom-2.5 left-2.5 right-2.5 truncate text-xs font-bold text-white">
                  {asset.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-label="Filters" className="space-y-3">
        <h2 className="sr-only">Filter restaurants</h2>
        <div role="radiogroup" aria-label="Diet preference" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {DIET_OPTIONS.map((t) => {
            const active = diet === t.value;
            return (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setDiet(t.value)}
                className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                  active ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-stone-200 hover:bg-stone-100"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {diet === "ALL" && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900"
          >
            <span>
              <strong>All menus shown:</strong> Tier 2 segregated kitchens may list non-vegetarian dishes under &ldquo;All&rdquo;.
            </span>
            <button
              type="button"
              onClick={() => setDiet("PURE_VEG")}
              className="shrink-0 font-semibold text-green-800 underline hover:text-green-900"
            >
              Switch to Pure Veg
            </button>
          </div>
        )}

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          <div className="flex shrink-0 gap-2 sm:flex-wrap" role="group" aria-label="Quick filters">
            {QUICK.map((c) => {
              const active = quick === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setQuick(active ? null : c.id)}
                  className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${
                    active ? "bg-green-700 text-white" : "bg-white text-stone-700 ring-1 ring-stone-300 hover:bg-stone-100"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          {cuisines.length > 0 && (
            <div className="flex shrink-0 gap-2 sm:flex-wrap" role="group" aria-label="Cuisine">
              {cuisines.map((c) => {
                const active = activeCuisine === c;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCuisine(active ? null : c)}
                    className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${
                      active ? "bg-amber-500 text-ink" : "bg-amber-50 text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <LocationPicker />

      <section aria-labelledby="list-h" aria-live="polite" aria-busy={loading} className="space-y-3">
        <h2 id="list-h" className="text-xl font-bold">
          Restaurants near you
        </h2>
        {error ? (
          <ErrorBox error={error} onRetry={retry} />
        ) : loading && !items ? (
          <RestaurantGridSkeleton />
        ) : visible.length === 0 ? (
          <Empty>No restaurants match these filters. Try another diet, a different filter or a new location.</Empty>
        ) : (
          <ul className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${loading ? "opacity-60" : ""}`}>
            {visible.map((r, i) => (
              <RestaurantCard key={r.id} r={r} index={i} />
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="how-it-works-h"
        className="rounded-3xl border border-stone-200 bg-white p-5 shadow-2xs sm:p-6"
      >
        <div className="border-b border-stone-100 pb-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-green-800">
            How Veggo Eats works
          </p>
          <h2 id="how-it-works-h" className="mt-1 text-lg font-extrabold text-ink sm:text-xl">
            Order fresh vegetarian meals in minutes
          </h2>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {/* Pick your spot */}
          <div className="flex flex-col justify-between rounded-2xl border border-stone-200/80 bg-cream/55 p-4 transition hover:border-green-700/40">
            <div>
              <span
                aria-hidden="true"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 text-green-800 ring-1 ring-green-200"
              >
                <MapPinSvg className="h-5 w-5" />
              </span>
              <h3 className="mt-3 text-base font-extrabold text-ink">Pick your spot</h3>
              <p className="mt-1 text-sm leading-relaxed text-stone-600">
                Choose your delivery area or drop a pin on the map to see kitchens that deliver to your door.
              </p>
            </div>
            <div className="mt-4 border-t border-stone-200/70 pt-3">
              <button
                type="button"
                onClick={openLocationPickerModal}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-green-800 hover:text-green-950 hover:underline"
              >
                <span>Change spot ({location.label})</span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>

          {/* Order as a guest */}
          <div className="flex flex-col justify-between rounded-2xl border border-stone-200/80 bg-cream/55 p-4 transition hover:border-green-700/40">
            <div>
              <span
                aria-hidden="true"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-900 ring-1 ring-amber-200"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                  <path d="M3 6h18" />
                  <path d="M16 10a4 4 0 0 1-8 0" />
                </svg>
              </span>
              <h3 className="mt-3 text-base font-extrabold text-ink">Order as a guest</h3>
              <p className="mt-1 text-sm leading-relaxed text-stone-600">
                No account or password needed. Filter menus by Pure Veg, Vegan, or Jain preferences before you check out.
              </p>
            </div>
            <div className="mt-4 border-t border-stone-200/70 pt-3">
              <button
                type="button"
                onClick={() => {
                  setDiet("PURE_VEG");
                  document.getElementById("list-h")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-900 hover:text-ink hover:underline"
              >
                <span>Browse Pure Veg kitchens</span>
                <span aria-hidden="true">↑</span>
              </button>
            </div>
          </div>

          {/* Track with your number */}
          <div className="flex flex-col justify-between rounded-2xl border border-stone-200/80 bg-cream/55 p-4 transition hover:border-green-700/40">
            <div>
              <span
                aria-hidden="true"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 text-green-800 ring-1 ring-green-200"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                  <path d="M8 11h6M11 8v6" />
                </svg>
              </span>
              <h3 className="mt-3 text-base font-extrabold text-ink">Track with your number</h3>
              <p className="mt-1 text-sm leading-relaxed text-stone-600">
                Follow live kitchen prep and delivery status any time using your order number (e.g. FA-XXXXX-XXXXX).
              </p>
            </div>
            <div className="mt-4 border-t border-stone-200/70 pt-3">
              <Link
                href="/track"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-green-800 hover:text-green-950 hover:underline"
              >
                <span>Track an existing order</span>
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
