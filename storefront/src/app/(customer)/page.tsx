"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { catalog, type Restaurant } from "@/lib/api";
import { dietParam, usePrefs, certificationTier, CertBadge, OpenBadge, type DietFilter } from "@/features/catalog";
import { formatDistance } from "@/lib/money";
import { Empty, ErrorBox, Spinner } from "@/components/ui";

function LocationPicker() {
  const { location, setLocation } = usePrefs();
  const [lat, setLat] = useState(String(location.lat));
  const [lng, setLng] = useState(String(location.lng));
  const [msg, setMsg] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    setLat(String(location.lat));
    setLng(String(location.lng));
  }, [location.lat, location.lng]);

  const useMyLocation = () => {
    setMsg(null);
    if (!("geolocation" in navigator)) {
      setMsg("Geolocation is not available in this browser. Enter coordinates instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setLocation({
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
          label: "My location",
        });
      },
      (err) => {
        setLocating(false);
        setMsg(`Could not get your location (${err.message}). Enter coordinates instead.`);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    const la = Number(lat);
    const ln = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180 || lat.trim() === "" || lng.trim() === "") {
      setMsg("Latitude must be between -90 and 90 and longitude between -180 and 180.");
      return;
    }
    setMsg(null);
    setLocation({ lat: la, lng: ln, label: "Custom location" });
  };

  return (
    <details className="rounded-2xl border border-stone-200 bg-white p-3 text-sm shadow-sm">
      <summary className="cursor-pointer font-medium">
        Delivering to: {location.label} ({location.lat.toFixed(4)}, {location.lng.toFixed(4)})
      </summary>
      <div className="mt-3 space-y-3">
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="rounded-lg bg-green-700 px-3 py-2 font-medium text-white hover:bg-green-800 disabled:opacity-60"
        >
          {locating ? "Locating..." : "Use my current location"}
        </button>
        <form onSubmit={apply} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-stone-600">Latitude</span>
            <input
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              inputMode="decimal"
              className="w-32 rounded border border-stone-300 px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-stone-600">Longitude</span>
            <input
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              inputMode="decimal"
              className="w-32 rounded border border-stone-300 px-2 py-1.5"
            />
          </label>
          <button type="submit" className="rounded-lg border border-stone-300 px-3 py-1.5 font-medium hover:bg-stone-100">
            Apply
          </button>
          <button
            type="button"
            onClick={() => setLocation({ lat: 12.9716, lng: 77.5946, label: "Bengaluru (default)" })}
            className="rounded-lg px-3 py-1.5 text-stone-600 underline"
          >
            Reset to Bengaluru
          </button>
        </form>
        {msg && (
          <p role="alert" className="text-red-700">
            {msg}
          </p>
        )}
      </div>
    </details>
  );
}

const GRADIENTS = [
  "from-green-400 to-emerald-600",
  "from-amber-300 to-orange-500",
  "from-lime-400 to-green-600",
  "from-teal-400 to-cyan-600",
  "from-yellow-300 to-amber-500",
];

function gradientFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

const CUISINE_EMOJI: Record<string, string> = {
  "south indian": "🥘",
  "north indian": "🍛",
  gujarati: "🍲",
  vegan: "🌱",
  chinese: "🥡",
  italian: "🍝",
  "street food": "🌯",
  desserts: "🍰",
  beverages: "🥤",
};

function cuisineEmoji(name: string): string {
  return CUISINE_EMOJI[name.toLowerCase()] ?? "🍽️";
}

function RestaurantCard({ r }: { r: Restaurant }) {
  return (
    <li>
      <Link
        href={`/restaurants/${encodeURIComponent(r.id)}`}
        className={`group block overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200 transition hover:-translate-y-0.5 hover:shadow-lg ${
          r.open ? "" : "opacity-75"
        }`}
      >
        <div className={`relative flex h-28 items-end bg-gradient-to-br ${gradientFor(r.id)} p-3`}>
          <span aria-hidden="true" className="absolute right-3 top-2 text-5xl opacity-90 transition group-hover:scale-110">
            🥗
          </span>
          <span className="rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold text-stone-800">
            {formatDistance(r.distanceMeters)}
          </span>
        </div>
        <div className="space-y-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-bold">{r.name}</h3>
            <OpenBadge open={r.open} />
          </div>
          {r.cuisine && <p className="text-sm text-stone-600">{r.cuisine}</p>}
          <div className="flex flex-wrap gap-1.5">
            <CertBadge level={r.kitchenCertificationLevel} />
          </div>
        </div>
      </Link>
    </li>
  );
}

const DIET_TILES: { value: DietFilter; label: string; emoji: string; hint: string; tone: string }[] = [
  { value: "ALL", label: "All", emoji: "🍽️", hint: "Everything", tone: "from-stone-100 to-stone-200 text-stone-800" },
  { value: "PURE_VEG", label: "Pure Veg", emoji: "🥦", hint: "100% vegetarian", tone: "from-green-100 to-green-200 text-green-900" },
  { value: "VEGAN", label: "Vegan", emoji: "🌱", hint: "Plant based", tone: "from-emerald-100 to-teal-200 text-emerald-900" },
  { value: "JAIN", label: "Jain", emoji: "🙏", hint: "No onion or garlic", tone: "from-amber-100 to-orange-200 text-amber-900" },
];

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
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-green-700 via-emerald-600 to-lime-500 px-5 py-8 text-white shadow-lg sm:px-10 sm:py-12"
      >
        <span aria-hidden="true" className="pointer-events-none absolute -right-6 -top-6 text-[9rem] leading-none opacity-20">
          🥬
        </span>
        <p className="text-sm font-semibold uppercase tracking-widest text-lime-100">Pure veg · Vegan · Jain</p>
        <h1 id="hero-h" className="mt-2 max-w-xl text-3xl font-extrabold leading-tight sm:text-5xl">
          Veg, on the go.
        </h1>
        <p className="mt-3 max-w-lg text-green-50">
          Every kitchen is checked for its veg standard, so you can order with confidence.
        </p>
        <div className="mt-6 max-w-xl">
          <label htmlFor="search" className="sr-only">
            Search restaurants
          </label>
          <input
            id="search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search restaurants or dishes"
            className="w-full rounded-2xl border-0 bg-white px-4 py-3.5 text-stone-900 shadow-md placeholder:text-stone-500"
          />
        </div>
      </section>

      <section aria-labelledby="cat-h" className="space-y-3">
        <h2 id="cat-h" className="text-xl font-bold">
          What are you eating today?
        </h2>
        <div role="radiogroup" aria-label="Diet preference" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {DIET_TILES.map((t) => {
            const active = diet === t.value;
            return (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setDiet(t.value)}
                className={`rounded-2xl bg-gradient-to-br ${t.tone} p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                  active ? "ring-4 ring-green-600" : "ring-1 ring-black/5"
                }`}
              >
                <span aria-hidden="true" className="block text-3xl">
                  {t.emoji}
                </span>
                <span className="mt-2 block font-bold">{t.label}</span>
                <span className="block text-xs opacity-80">{t.hint}</span>
              </button>
            );
          })}
        </div>

        {cuisines.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-stone-700">Browse by cuisine</h3>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Cuisine">
              {cuisines.map((c) => {
                const active = activeCuisine === c;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCuisine(active ? null : c)}
                    className={`flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold shadow-sm transition ${
                      active
                        ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white"
                        : "bg-white text-stone-800 ring-1 ring-stone-200 hover:bg-orange-50"
                    }`}
                  >
                    <span aria-hidden="true">{cuisineEmoji(c)}</span>
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick filters">
          {QUICK.map((c) => {
            const active = quick === c.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={active}
                onClick={() => setQuick(active ? null : c.id)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  active ? "bg-green-700 text-white" : "bg-white text-stone-700 ring-1 ring-stone-300 hover:bg-stone-100"
                }`}
              >
                {c.label}
              </button>
            );
          })}
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
          <Spinner label="Finding restaurants" />
        ) : visible.length === 0 ? (
          <Empty>No restaurants match these filters. Try another diet, a different filter or a new location.</Empty>
        ) : (
          <ul className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${loading ? "opacity-60" : ""}`}>
            {visible.map((r) => (
              <RestaurantCard key={r.id} r={r} />
            ))}
          </ul>
        )}
      </section>

      <section aria-label="How it works" className="grid gap-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-stone-200 sm:grid-cols-3">
        {[
          ["📍", "Pick your spot", "Set your location to see kitchens that deliver to you."],
          ["🛒", "Order as a guest", "No account needed. Verify your phone with a quick OTP."],
          ["🔎", "Track with your number", "Follow your order any time using the order number."],
        ].map(([icon, title, text]) => (
          <div key={title}>
            <span aria-hidden="true" className="text-3xl">
              {icon}
            </span>
            <h3 className="mt-2 font-bold">{title}</h3>
            <p className="text-sm text-stone-600">{text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
