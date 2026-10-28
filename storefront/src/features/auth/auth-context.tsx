"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { identity, type Me } from "@/lib/api";
import { getTokens, setTokens, subscribeTokens } from "@/lib/tokens";

type Status = "loading" | "authed" | "anon";

interface AuthCtx {
  status: Status;
  me: Me | null;
  /** Call after a successful OTP verification (tokens already stored). */
  reload: () => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [me, setMe] = useState<Me | null>(null);

  const reload = useCallback(async () => {
    if (!getTokens()) {
      setMe(null);
      setStatus("anon");
      return;
    }
    try {
      const m = await identity.me();
      setMe(m);
      setStatus("authed");
    } catch {
      // 401 is handled (refresh -> redirect) in the api client; other errors leave us signed-out in the UI only.
      setMe(null);
      setStatus(getTokens() ? "authed" : "anon");
    }
  }, []);

  useEffect(() => {
    void reload();
    return subscribeTokens(() => {
      if (!getTokens()) {
        setMe(null);
        setStatus("anon");
      }
    });
  }, [reload]);

  const logout = useCallback(() => {
    setTokens(null);
    setMe(null);
    setStatus("anon");
  }, []);

  const value = useMemo(() => ({ status, me, reload, logout }), [status, me, reload, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
