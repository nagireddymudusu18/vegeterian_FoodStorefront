import { resolvePortalScope, type PortalScope } from "@/features/auth/roles";

/**
 * Access/refresh token holder: in memory + localStorage, isolated per portal scope
 * (`customer`, `admin`, `restaurant`, `partner`) so staff and customer sessions
 * never overwrite each other in the same browser.
 */

const LEGACY_KEY = "sf.tokens.v1";

function storageKey(scope: PortalScope): string {
  return `sf.tokens.${scope}.v1`;
}

function activeScope(explicit?: PortalScope): PortalScope {
  if (explicit) return explicit;
  if (typeof window === "undefined") return "customer";
  return resolvePortalScope(window.location.pathname);
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  /** epoch ms when the access token expires (informational) */
  expiresAt?: number;
}

const memoryByScope = new Map<PortalScope, Tokens | null>();
const loadedByScope = new Set<PortalScope>();
const listeners = new Set<() => void>();

function parseTokens(raw: string | null): Tokens | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Tokens;
    if (typeof v.accessToken === "string" && typeof v.refreshToken === "string") {
      return v;
    }
  } catch {
    /* ignore malformed token payload */
  }
  return null;
}

function load(scope: PortalScope): Tokens | null {
  if (typeof window === "undefined") return memoryByScope.get(scope) ?? null;
  if (loadedByScope.has(scope)) return memoryByScope.get(scope) ?? null;
  loadedByScope.add(scope);
  try {
    const scopedRaw = window.localStorage.getItem(storageKey(scope));
    const parsedScoped = parseTokens(scopedRaw);
    if (parsedScoped) {
      memoryByScope.set(scope, parsedScoped);
      return parsedScoped;
    }
    // Backwards-compatible fallback to legacy single-key storage if no scoped token exists yet
    const legacyParsed = parseTokens(window.localStorage.getItem(LEGACY_KEY));
    memoryByScope.set(scope, legacyParsed);
    return legacyParsed;
  } catch {
    memoryByScope.set(scope, null);
    return null;
  }
}

export function getTokens(scope?: PortalScope): Tokens | null {
  return load(activeScope(scope));
}

export function setTokens(t: Tokens | null, scope?: PortalScope): void {
  const s = activeScope(scope);
  loadedByScope.add(s);
  memoryByScope.set(s, t);
  if (typeof window !== "undefined") {
    try {
      const key = storageKey(s);
      if (t) {
        window.localStorage.setItem(key, JSON.stringify(t));
      } else {
        window.localStorage.removeItem(key);
        window.localStorage.removeItem(LEGACY_KEY);
      }
    } catch {
      /* storage unavailable: keep in memory only */
    }
  }
  listeners.forEach((l) => l());
}

export function subscribeTokens(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

