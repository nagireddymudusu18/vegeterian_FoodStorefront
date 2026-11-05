"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { adminRestaurants, type Restaurant } from "@/lib/api";
import { validateEmail } from "@/features/auth";
import { BENGALURU_PRESETS, CertBadge } from "@/features/catalog";
import { Empty, ErrorBox, Spinner } from "@/components/ui";

/** Restaurant owners & onboarding: create new restaurants and link owners to their kitchens. */
export default function AdminRestaurants() {
  const [restaurants, setRestaurants] = useState<Restaurant[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [restaurantId, setRestaurantId] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  // Onboarding new restaurant state
  const [creatingOpen, setCreatingOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFssai, setNewFssai] = useState("");
  const [newCuisine, setNewCuisine] = useState("South Indian");
  const [newTier, setNewTier] = useState<"TIER_1_EXCLUSIVE_VEG" | "TIER_2_SEGREGATED_KITCHEN">("TIER_1_EXCLUSIVE_VEG");
  const [newSpotId, setNewSpotId] = useState(BENGALURU_PRESETS[0]?.id ?? "mg-road");
  const [newRadius, setNewRadius] = useState("5000");
  const [creatingBusy, setCreatingBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await adminRestaurants.list();
      setRestaurants(list);
      setRestaurantId((cur) => cur || list[0]?.id || "");
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function link(e: React.FormEvent) {
    e.preventDefault();
    const restaurant = restaurants?.find((r) => r.id === restaurantId);
    if (!restaurant) return setError(new Error("Choose a restaurant."));
    if (!validateEmail(email)) return setError(new Error("Enter a valid email address."));
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const { userId } = await adminRestaurants.grantOwner(email.trim());
      await adminRestaurants.setOwner(restaurant, userId);
      setDone(`${email.trim()} now owns ${restaurant.name}. They see the Kitchen area after signing in again.`);
      setEmail("");
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateRestaurant(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return setError(new Error("Enter a restaurant name."));
    if (!/^\d{14}$/.test(newFssai.trim())) {
      return setError(new Error("Enter a valid 14-digit FSSAI license number."));
    }
    const preset = BENGALURU_PRESETS.find((p) => p.id === newSpotId) ?? BENGALURU_PRESETS[0];
    const radiusMeters = Number(newRadius) || 5000;
    setCreatingBusy(true);
    setError(null);
    try {
      const created = await adminRestaurants.create({
        name: newName.trim(),
        fssaiNumber: newFssai.trim(),
        cuisine: newCuisine.trim() || "Pure Veg",
        kitchenCertificationLevel: newTier,
        lat: preset.lat,
        lng: preset.lng,
        deliveryRadiusMeters: radiusMeters,
        open: true,
      });
      toast.success(`${created.name} onboarded to catalog`);
      setNewName("");
      setNewFssai("");
      setCreatingOpen(false);
      await load();
      setRestaurantId(created.id);
    } catch (err) {
      setError(err);
    } finally {
      setCreatingBusy(false);
    }
  }

  const linked = (r: Restaurant) => typeof r.ownerUserId === "string" && r.ownerUserId !== "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Restaurants</h1>
          <p className="text-sm text-stone-600">
            Onboard certified kitchens and link restaurant owner accounts so paid orders reach their live kitchen console.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreatingOpen((v) => !v)}
          className="rounded-xl bg-[#1B5E3A] px-4 py-2 text-sm font-bold text-white hover:bg-green-800"
        >
          {creatingOpen ? "Close form" : "+ Onboard restaurant"}
        </button>
      </div>

      {error !== null && <ErrorBox error={error} />}

      {creatingOpen && (
        <form onSubmit={handleCreateRestaurant} noValidate className="card space-y-4 border-2 border-[#1B5E3A]/25 p-5">
          <h2 className="text-base font-bold text-stone-900">Onboard a new kitchen</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="new-rest-name" className="mb-1 block text-xs font-bold uppercase tracking-wider text-stone-600">
                Restaurant name
              </label>
              <input
                id="new-rest-name"
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Anand Bhavan Pure Veg"
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="new-rest-fssai" className="mb-1 block text-xs font-bold uppercase tracking-wider text-stone-600">
                14-Digit FSSAI License
              </label>
              <input
                id="new-rest-fssai"
                type="text"
                inputMode="numeric"
                maxLength={14}
                required
                value={newFssai}
                onChange={(e) => setNewFssai(e.target.value.replace(/\D/g, ""))}
                placeholder="11224001000999"
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 font-mono text-sm"
              />
            </div>
            <div>
              <label htmlFor="new-rest-cuisine" className="mb-1 block text-xs font-bold uppercase tracking-wider text-stone-600">
                Cuisine category
              </label>
              <input
                id="new-rest-cuisine"
                type="text"
                value={newCuisine}
                onChange={(e) => setNewCuisine(e.target.value)}
                placeholder="South Indian, Jain Thali, Vegan Bowls"
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="new-rest-tier" className="mb-1 block text-xs font-bold uppercase tracking-wider text-stone-600">
                Kitchen Certification Tier
              </label>
              <select
                id="new-rest-tier"
                value={newTier}
                onChange={(e) => setNewTier(e.target.value as "TIER_1_EXCLUSIVE_VEG" | "TIER_2_SEGREGATED_KITCHEN")}
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
              >
                <option value="TIER_1_EXCLUSIVE_VEG">Tier 1 — Exclusive 100% Pure Veg Kitchen</option>
                <option value="TIER_2_SEGREGATED_KITCHEN">Tier 2 — Segregated Veg Line</option>
              </select>
            </div>
            <div>
              <label htmlFor="new-rest-spot" className="mb-1 block text-xs font-bold uppercase tracking-wider text-stone-600">
                Bengaluru Hub Location
              </label>
              <select
                id="new-rest-spot"
                value={newSpotId}
                onChange={(e) => setNewSpotId(e.target.value)}
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
              >
                {BENGALURU_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.zone})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="new-rest-radius" className="mb-1 block text-xs font-bold uppercase tracking-wider text-stone-600">
                Delivery radius (meters)
              </label>
              <input
                id="new-rest-radius"
                type="number"
                min={500}
                max={20000}
                step={500}
                value={newRadius}
                onChange={(e) => setNewRadius(e.target.value)}
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreatingOpen(false)}
              className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creatingBusy}
              className="rounded-xl bg-[#1B5E3A] px-4 py-2 text-xs font-bold text-white hover:bg-green-800 disabled:opacity-60"
            >
              {creatingBusy ? "Creating..." : "Create restaurant"}
            </button>
          </div>
        </form>
      )}

      <form onSubmit={link} noValidate className="card grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <label htmlFor="owner-restaurant" className="mb-1 block text-sm font-medium">
            Restaurant
          </label>
          <select
            id="owner-restaurant"
            value={restaurantId}
            onChange={(e) => setRestaurantId(e.target.value)}
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 focus:border-green-600"
          >
            {(restaurants ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="owner-email" className="mb-1 block text-sm font-medium">
            Owner&apos;s account email
          </label>
          <input
            id="owner-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 focus:border-green-600"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !restaurants?.length}
          className="rounded-xl bg-stone-900 px-4 py-2.5 font-semibold text-white hover:bg-stone-800 disabled:opacity-60"
        >
          Link owner
        </button>
        {done && (
          <p role="status" className="text-sm text-green-800 sm:col-span-3">
            {done}
          </p>
        )}
      </form>

      {!restaurants ? (
        error ? null : <Spinner label="Loading restaurants" />
      ) : restaurants.length === 0 ? (
        <Empty>No restaurants yet.</Empty>
      ) : (
        <ul className="card divide-y divide-stone-200">
          {restaurants.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{r.name}</p>
                  <CertBadge level={r.kitchenCertificationLevel} />
                </div>
                <p className="text-sm text-stone-600">
                  {r.cuisine ? `${r.cuisine} · ` : ""}
                  {r.fssaiNumber ? `FSSAI ${r.fssaiNumber} · ` : ""}
                  {r.open ? "Open" : "Closed"}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  linked(r) ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"
                }`}
              >
                {linked(r) ? "Owner linked" : "No owner"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
