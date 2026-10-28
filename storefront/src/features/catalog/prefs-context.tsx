"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isDietFilter, type DietFilter } from "./diet";

export interface Location {
  lat: number;
  lng: number;
  label: string;
}

export const DEFAULT_LOCATION: Location = { lat: 12.9716, lng: 77.5946, label: "Bengaluru (default)" };

const LOC_KEY = "sf.location.v1";
const DIET_KEY = "sf.diet.v1";

interface PrefsCtx {
  ready: boolean;
  location: Location;
  setLocation: (l: Location) => void;
  diet: DietFilter;
  setDiet: (d: DietFilter) => void;
}

const Ctx = createContext<PrefsCtx | null>(null);

function validLocation(v: unknown): v is Location {
  const l = v as Location;
  return (
    !!l &&
    typeof l.lat === "number" &&
    typeof l.lng === "number" &&
    Math.abs(l.lat) <= 90 &&
    Math.abs(l.lng) <= 180
  );
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [location, setLocationState] = useState<Location>(DEFAULT_LOCATION);
  const [diet, setDietState] = useState<DietFilter>("ALL");

  useEffect(() => {
    try {
      const l = JSON.parse(window.localStorage.getItem(LOC_KEY) ?? "null") as unknown;
      if (validLocation(l)) setLocationState({ lat: l.lat, lng: l.lng, label: l.label || "Saved location" });
      const d = window.localStorage.getItem(DIET_KEY);
      if (isDietFilter(d)) setDietState(d);
    } catch {
      /* ignore corrupt storage */
    }
    setReady(true);
  }, []);

  const setLocation = useCallback((l: Location) => {
    setLocationState(l);
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

  const value = useMemo(
    () => ({ ready, location, setLocation, diet, setDiet }),
    [ready, location, setLocation, diet, setDiet],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs(): PrefsCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePrefs must be used inside PrefsProvider");
  return c;
}
