"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { identity, type Me } from "@/lib/api";
import { getTokens, setTokens, subscribeTokens } from "@/lib/tokens";
import { resolvePortalScope, type PortalScope } from "./roles";

type Status = "loading" | "authed" | "anon";

interface AuthCtx {
  status: Status;
  me: Me | null;
  scope: PortalScope;
  /** Call after a successful OTP verification (tokens already stored). */
  reload: () => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const scope = resolvePortalScope(pathname);
  const [status, setStatus] = useState<Status>("loading");
  const [me, setMe] = useState<Me | null>(null);

  const reload = useCallback(async () => {
    if (!getTokens(scope)) {
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
      setStatus(getTokens(scope) ? "authed" : "anon");
    }
  }, [scope]);

  useEffect(() => {
    void reload();
    return subscribeTokens(() => {
      if (!getTokens(scope)) {
        setMe(null);
        setStatus("anon");
      }
    });
  }, [reload, scope]);

  const logout = useCallback(() => {
    setTokens(null, scope);
    setMe(null);
    setStatus("anon");
  }, [scope]);

  const value = useMemo(() => ({ status, me, scope, reload, logout }), [status, me, scope, reload, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}

