"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { flagsApi } from "@/lib/api";

export type FlagKey =
  | "otp_login"
  | "email_registration"
  | "guest_checkout"
  | "order_tracking"
  | "live_order_updates"
  | "delivery_module";

type Flags = Partial<Record<FlagKey, boolean>>;

interface FlagsCtx {
  loaded: boolean;
  flags: Flags;
  refresh: () => Promise<void>;
}

const Ctx = createContext<FlagsCtx | null>(null);

export function FlagsProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<Flags>({});
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setFlags(await flagsApi.get());
    } catch {
      // Keep the last known flags; features default to on so an outage never hides the storefront.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ loaded, flags, refresh }), [loaded, flags, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFlags(): FlagsCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useFlags must be used inside FlagsProvider");
  return c;
}

/** Flags the server does not know yet (or that are still loading) count as on, except delivery_module. */
export function isOn(flags: Flags, key: FlagKey): boolean {
  return flags[key] ?? key !== "delivery_module";
}

export function useFlag(key: FlagKey): boolean {
  return isOn(useFlags().flags, key);
}
