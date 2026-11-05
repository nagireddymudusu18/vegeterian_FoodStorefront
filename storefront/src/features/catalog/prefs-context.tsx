"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { identity } from "@/lib/api";
import { getTokens } from "@/lib/tokens";
import { DEFAULT_DIET, isDietFilter, type DietFilter } from "./diet";
import { pushRecentLocation } from "./locations";
import {
  DEFAULT_CONSENTS,
  removeSavedAddressById,
  sanitizeAllergenWatchlist,
  sanitizeConsents,
  sanitizeSavedAddresses,
  toggleAllergenInList,
  upsertSavedAddress,
  type AllergenKey,
  type ConsentPurpose,
  type SavedAddress,
} from "./profile-prefs";

export interface Location {
  lat: number;
  lng: number;
  label: string;
}

export const DEFAULT_LOCATION: Location = { lat: 12.9716, lng: 77.5946, label: "MG Road, Bengaluru" };

const LOC_KEY = "sf.location.v1";
const RECENT_LOC_KEY = "sf.recent_locations.v1";
const DIET_KEY = "sf.diet.v1";
const ALLERGEN_KEY = "sf.allergen_watchlist.v1";
const SAVED_ADDR_KEY = "sf.saved_addresses.v1";
const CONSENTS_KEY = "sf.consents.v1";

interface PrefsCtx {
  ready: boolean;
  location: Location;
  setLocation: (l: Location) => void;
  recentLocations: Location[];
  diet: DietFilter;
  setDiet: (d: DietFilter) => void;
  allergenWatchlist: AllergenKey[];
  toggleAllergen: (key: AllergenKey) => void;
  clearAllergens: () => void;
  savedAddresses: SavedAddress[];
  saveAddress: (input: Omit<SavedAddress, "id" | "updatedAt"> & { id?: string }) => void;
  removeAddress: (id: string) => void;
  consents: Record<ConsentPurpose, boolean>;
  setConsentPref: (purpose: ConsentPurpose, granted: boolean) => void;
}

const Ctx = createContext<PrefsCtx | null>(null);

function validLocation(v: unknown): v is Location {
  const l = v as Location;
  return (
    !!l &&
    typeof l.lat === "number" &&
    typeof l.lng === "number" &&
    Number.isFinite(l.lat) &&
    Number.isFinite(l.lng) &&
    Math.abs(l.lat) <= 90 &&
    Math.abs(l.lng) <= 180
  );
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [location, setLocationState] = useState<Location>(DEFAULT_LOCATION);
  const [recentLocations, setRecentLocations] = useState<Location[]>([]);
  const [diet, setDietState] = useState<DietFilter>(DEFAULT_DIET);
  const [allergenWatchlist, setAllergenWatchlist] = useState<AllergenKey[]>([]);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [consents, setConsentsState] = useState<Record<ConsentPurpose, boolean>>(DEFAULT_CONSENTS);
  const serverHydrated = useRef(false);

  useEffect(() => {
    try {
      const l = JSON.parse(window.localStorage.getItem(LOC_KEY) ?? "null") as unknown;
      if (validLocation(l)) {
        setLocationState({ lat: l.lat, lng: l.lng, label: l.label || "Saved location" });
      }
      const r = JSON.parse(window.localStorage.getItem(RECENT_LOC_KEY) ?? "[]") as unknown;
      if (Array.isArray(r)) {
        setRecentLocations(
          r
            .filter(validLocation)
            .map((item) => ({ lat: item.lat, lng: item.lng, label: item.label || "Saved location" }))
            .slice(0, 4),
        );
      }
      const d = window.localStorage.getItem(DIET_KEY);
      if (isDietFilter(d)) setDietState(d);

      const rawAllergens = JSON.parse(window.localStorage.getItem(ALLERGEN_KEY) ?? "[]") as unknown;
      setAllergenWatchlist(sanitizeAllergenWatchlist(rawAllergens));

      const rawAddresses = JSON.parse(window.localStorage.getItem(SAVED_ADDR_KEY) ?? "[]") as unknown;
      setSavedAddresses(sanitizeSavedAddresses(rawAddresses));

      const rawConsents = JSON.parse(window.localStorage.getItem(CONSENTS_KEY) ?? "null") as unknown;
      setConsentsState(sanitizeConsents(rawConsents));
    } catch {
      /* ignore corrupt storage */
    }
    setReady(true);

    // Cross-device sync: pull encrypted preferences from identity-service when signed in
    if (getTokens()?.accessToken) {
      const ctrl = new AbortController();
      identity
        .getPreferences(ctrl.signal)
        .then((remote) => {
          if (!remote || typeof remote !== "object") return;
          if (isDietFilter(remote.diet)) {
            setDietState(remote.diet);
            try {
              window.localStorage.setItem(DIET_KEY, remote.diet);
            } catch {
              /* ignore */
            }
          }
          if (Array.isArray(remote.allergenWatchlist)) {
            const clean = sanitizeAllergenWatchlist(remote.allergenWatchlist);
            setAllergenWatchlist((prev) => (clean.length > 0 ? clean : prev));
          }
          if (Array.isArray(remote.savedAddresses)) {
            const cleanAddr = sanitizeSavedAddresses(remote.savedAddresses);
            setSavedAddresses((prev) => (cleanAddr.length > 0 ? cleanAddr : prev));
          }
          if (remote.consents && typeof remote.consents === "object") {
            setConsentsState(sanitizeConsents(remote.consents));
          }
        })
        .catch(() => {})
        .finally(() => {
          serverHydrated.current = true;
        });
      return () => ctrl.abort();
    } else {
      serverHydrated.current = true;
    }
  }, []);

  // Push preference changes to identity-service when authenticated
  useEffect(() => {
    if (!ready || !serverHydrated.current || !getTokens()?.accessToken) return;
    const timer = setTimeout(() => {
      identity
        .savePreferences({
          diet,
          allergenWatchlist,
          savedAddresses,
          consents,
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [ready, diet, allergenWatchlist, savedAddresses, consents]);

  const setLocation = useCallback((l: Location) => {
    setLocationState(l);
    setRecentLocations((prev) => {
      const next = pushRecentLocation(prev, l, 4);
      try {
        window.localStorage.setItem(RECENT_LOC_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    try {
      window.localStorage.setItem(LOC_KEY, JSON.stringify(l));
    } catch {
      /* ignore */
    }
  }, []);

  const setDiet = useCallback((d: DietFilter) => {
    setDietState(d);
    try {
      window.localStorage.setItem(DIET_KEY, d);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleAllergen = useCallback((key: AllergenKey) => {
    setAllergenWatchlist((prev) => {
      const next = toggleAllergenInList(prev, key);
      try {
        window.localStorage.setItem(ALLERGEN_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const clearAllergens = useCallback(() => {
    setAllergenWatchlist([]);
    try {
      window.localStorage.setItem(ALLERGEN_KEY, JSON.stringify([]));
    } catch {
      /* ignore */
    }
  }, []);

  const saveAddress = useCallback((input: Omit<SavedAddress, "id" | "updatedAt"> & { id?: string }) => {
    setSavedAddresses((prev) => {
      const next = upsertSavedAddress(prev, input, 8);
      try {
        window.localStorage.setItem(SAVED_ADDR_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const removeAddress = useCallback((id: string) => {
    setSavedAddresses((prev) => {
      const next = removeSavedAddressById(prev, id);
      try {
        window.localStorage.setItem(SAVED_ADDR_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const setConsentPref = useCallback((purpose: ConsentPurpose, granted: boolean) => {
    setConsentsState((prev) => {
      const next = { ...prev, [purpose]: granted };
      try {
        window.localStorage.setItem(CONSENTS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      ready,
      location,
      setLocation,
      recentLocations,
      diet,
      setDiet,
      allergenWatchlist,
      toggleAllergen,
      clearAllergens,
      savedAddresses,
      saveAddress,
      removeAddress,
      consents,
      setConsentPref,
    }),
    [
      ready,
      location,
      setLocation,
      recentLocations,
      diet,
      setDiet,
      allergenWatchlist,
      toggleAllergen,
      clearAllergens,
      savedAddresses,
      saveAddress,
      removeAddress,
      consents,
      setConsentPref,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs(): PrefsCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePrefs must be used inside PrefsProvider");
  return c;
}
