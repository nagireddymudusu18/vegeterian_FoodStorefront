"use client";

import { useCallback, useEffect, useState } from "react";
import { adminRestaurants, type Restaurant } from "@/lib/api";
import { validateEmail } from "@/features/auth";
import { Empty, ErrorBox, Spinner } from "@/components/ui";

/** Restaurant owners: grant the owner role to an account and link it to its restaurant (two API calls, one form). */
export default function AdminRestaurants() {
  const [restaurants, setRestaurants] = useState<Restaurant[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [restaurantId, setRestaurantId] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

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

  const linked = (r: Restaurant) => typeof r.ownerUserId === "string" && r.ownerUserId !== "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Restaurants</h1>
        <p className="text-sm text-stone-600">
          Give a restaurant owner access to their kitchen. The owner must already have an account (sign-up with email); this gives that
          account the restaurant role and links it to the restaurant, so new paid orders reach them.
        </p>
      </div>

      {error !== null && <ErrorBox error={error} />}

      <form onSubmit={link} noValidate className="grid gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
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
        <ul className="divide-y divide-stone-200 rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
          {restaurants.map((r) => (
            <li key={r.id} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{r.name}</p>
                <p className="text-sm text-stone-600">
                  {r.cuisine ? `${r.cuisine} · ` : ""}
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
