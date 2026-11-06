import {
  accountDomainFromAccessToken,
  resolvePortalScope,
  rolesFromAccessToken,
  type PortalScope,
} from "@/features/auth/roles";

/**
 * Access/refresh token holder: in memory + localStorage, isolated per portal scope
 * (`customer`, `admin`, `restaurant`, `partner`) so staff and customer sessions
 * never overwrite or bleed into each other in the same browser.
 */

const LEGACY_KEY = "sf.tokens.v1";
const ACTIVE_PORTAL_KEY = "sf.active_portal.v1";

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

function tokenMatchesScope(accessToken: string, scope: PortalScope): boolean {
  const domain = accountDomainFromAccessToken(accessToken);
  const roles = rolesFromAccessToken(accessToken);
  switch (scope) {
    case "restaurant":
      return domain === "RESTAURANT_OWNER" || roles.includes("RESTAURANT") || roles.includes("ADMIN");
    case "partner":
      return domain === "DELIVERY_PARTNER" || roles.includes("PARTNER") || roles.includes("ADMIN");
    case "admin":
      return domain === "ADMIN" || roles.includes("ADMIN");
    case "customer":
    default:
      if (domain === "RESTAURANT_OWNER" || domain === "DELIVERY_PARTNER" || domain === "ADMIN") {
        return false;
      }
      return domain === "CUSTOMER" || roles.includes("CUSTOMER") || roles.length === 0;
  }
}

function parseTokens(raw: string | null, scope: PortalScope): Tokens | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Tokens;
    if (typeof v.accessToken === "string" && typeof v.refreshToken === "string") {
      if (tokenMatchesScope(v.accessToken, scope)) {
        return v;
      }
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
    const parsedScoped = parseTokens(scopedRaw, scope);
    if (parsedScoped) {
      memoryByScope.set(scope, parsedScoped);
      return parsedScoped;
    }
    // Only allow legacy fallback if the token actually belongs to this portal scope
    const legacyParsed = parseTokens(window.localStorage.getItem(LEGACY_KEY), scope);
    if (legacyParsed) {
      window.localStorage.setItem(storageKey(scope), JSON.stringify(legacyParsed));
      window.localStorage.removeItem(LEGACY_KEY);
    }
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

export function getActivePortalScope(): PortalScope | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_PORTAL_KEY);
    if (raw === "restaurant" || raw === "partner" || raw === "admin" || raw === "customer") {
      if (load(raw)) return raw;
    }
    if (load("restaurant")) return "restaurant";
    if (load("partner")) return "partner";
  } catch {
    /* ignore */
  }
  return null;
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
        window.localStorage.setItem(ACTIVE_PORTAL_KEY, s);
      } else {
        window.localStorage.removeItem(key);
        window.localStorage.removeItem(LEGACY_KEY);
        const currentActive = window.localStorage.getItem(ACTIVE_PORTAL_KEY);
        if (currentActive === s) {
          window.localStorage.removeItem(ACTIVE_PORTAL_KEY);
        }
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

