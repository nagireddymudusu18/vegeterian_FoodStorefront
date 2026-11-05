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
} from "@/features/catalog";
import { formatDistance } from "@/lib/money";
import { Empty, ErrorBox } from "@/components/ui";
import { RestaurantGridSkeleton } from "@/components/Skeletons";
import { FadeInItem } from "@/components/motion";

const TINTS = [
  { bg: "bg-haldi", ink: "text-green-800" },
  { bg: "bg-green-100", ink: "text-green-800" },
  { bg: "bg-amber-100", ink: "text-amber-900" },
];

function tintFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

function RestaurantCard({ r, index }: { r: Restaurant; index: number }) {
  const tint = tintFor(r.id);
  return (
    <FadeInItem index={index}>
      <Link
        href={`/restaurants/${encodeURIComponent(r.id)}`}
        className={`group block overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-stone-200 transition hover:-translate-y-0.5 hover:shadow-lg ${
          r.open ? "" : "opacity-75"
        }`}
      >
        <div className={`relative flex h-32 items-center justify-center overflow-hidden ${tint.bg}`}>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 85% 15%, rgb(255 255 255 / .55) 0 22%, transparent 23%), radial-gradient(circle at 10% 95%, rgb(255 255 255 / .35) 0 26%, transparent 27%)",
            }}
          />
          <span aria-hidden="true" className={`relative text-6xl font-extrabold tracking-tight opacity-80 ${tint.ink}`}>
            {r.name.trim().charAt(0).toUpperCase()}
          </span>
          <span className="absolute bottom-3 left-3 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-ink shadow-sm">
            {formatDistance(r.distanceMeters)}
          </span>
        </div>
        <div className="space-y-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-bold leading-snug">{r.name}</h3>
            <OpenBadge open={r.open} />
          </div>
          {r.cuisine && <p className="text-sm text-stone-600">{r.cuisine}</p>}
          <div className="flex flex-wrap gap-1.5">
            <CertBadge level={r.kitchenCertificationLevel} />
          </div>
        </div>
      </Link>
    </FadeInItem>
  );
}

type Quick = "open" | "tier1" | "tier2" | "near";

const QUICK: { id: Quick; label: string; test: (r: Restaurant) => boolean }[] = [
  { id: "open", label: "Open now", test: (r) => r.open },
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
    return activeCuisine ? byQuick.filter((r) => r.cuisine === activeCuisine) : byQuick;
  }, [items, quick, activeCuisine]);

  return (
    <div className="space-y-8">
      <section
        aria-labelledby="hero-h"
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-green-700 to-green-600 px-5 py-7 text-white shadow-md sm:px-10 sm:py-10"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-5 top-5 h-12 w-12 rounded-full bg-amber-500 sm:-right-8 sm:-top-10 sm:h-44 sm:w-44"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-20 hidden h-64 w-64 rounded-full border-[22px] border-amber-500/20 sm:block"
        />
        <p className="relative text-xs font-bold uppercase tracking-[0.16em] text-amber-300 sm:text-sm">Pure veg · Vegan · Jain</p>
        <h1 id="hero-h" className="relative mt-2 max-w-xl text-4xl font-extrabold leading-[1.05] sm:text-6xl">
          Veg, on the go.
        </h1>
        <p className="relative mt-3 max-w-md text-green-50">
          Every kitchen is checked for its veg standard, so you can order with confidence.
        </p>
        <div className="relative mt-5 max-w-xl">
          <label htmlFor="search" className="sr-only">
            Search restaurants
          </label>
          <input
            id="search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search restaurants or dishes"
            className="w-full rounded-full border-0 bg-white px-5 py-3.5 text-ink shadow-md placeholder:text-stone-500"
          />
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
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-stone-100 pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-green-800">
              How Veggo Eats works
            </p>
            <h2 id="how-it-works-h" className="mt-1 text-lg font-extrabold text-ink sm:text-xl">
              From certified kitchen to your doorstep
            </h2>
          </div>
          <span className="rounded-lg bg-haldi/70 px-2.5 py-1 text-xs font-semibold text-amber-950 ring-1 ring-amber-300/60">
            FSSAI &amp; Veg-Tier Verified
          </span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {/* Step 1: Pick your spot */}
          <div className="flex flex-col justify-between rounded-2xl border border-stone-200/80 bg-cream/55 p-4 transition hover:border-green-700/40">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 text-green-800 ring-1 ring-green-200"
                >
                  <MapPinSvg className="h-5 w-5" />
                </span>
                <span className="rounded-md bg-white px-2 py-0.5 font-mono text-[11px] font-bold tracking-wider text-stone-500 ring-1 ring-stone-200">
                  STEP 01
                </span>
              </div>
              <h3 className="mt-3 text-base font-extrabold text-ink">Pick your spot</h3>
              <p className="mt-1 text-sm leading-relaxed text-stone-600">
                Choose a Bengaluru neighbourhood or drop a pin on the map to see certified kitchens that deliver to your door.
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

          {/* Step 2: Order as a guest */}
          <div className="flex flex-col justify-between rounded-2xl border border-stone-200/80 bg-cream/55 p-4 transition hover:border-green-700/40">
            <div>
              <div className="flex items-center justify-between gap-2">
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
                <span className="rounded-md bg-white px-2 py-0.5 font-mono text-[11px] font-bold tracking-wider text-stone-500 ring-1 ring-stone-200">
                  STEP 02
                </span>
              </div>
              <h3 className="mt-3 text-base font-extrabold text-ink">Order as a guest</h3>
              <p className="mt-1 text-sm leading-relaxed text-stone-600">
                No account or password needed. Every dish is checked against your Pure Veg, Vegan, or Jain guardrail before checkout.
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

          {/* Step 3: Track with your number */}
          <div className="flex flex-col justify-between rounded-2xl border border-stone-200/80 bg-cream/55 p-4 transition hover:border-green-700/40">
            <div>
              <div className="flex items-center justify-between gap-2">
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
                <span className="rounded-md bg-white px-2 py-0.5 font-mono text-[11px] font-bold tracking-wider text-stone-500 ring-1 ring-stone-200">
                  STEP 03
                </span>
              </div>
              <h3 className="mt-3 text-base font-extrabold text-ink">Track with your number</h3>
              <p className="mt-1 text-sm leading-relaxed text-stone-600">
                Follow live kitchen prep and delivery status any time using your Crockford order code (e.g. FA-XXXXX-XXXXX).
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
