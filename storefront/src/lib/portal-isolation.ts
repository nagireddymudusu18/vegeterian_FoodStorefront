export type PortalScope = "customer" | "restaurant" | "partner" | "admin";

export type PortalEnvSetting = PortalScope | "all";

export type PortalLockSource = "env" | "host" | "preview_lock" | "none";

export const PORTAL_SCOPES: readonly PortalScope[] = [
  "customer",
  "restaurant",
  "partner",
  "admin",
] as const;

export const PREVIEW_LOCK_COOKIE = "veggo_preview_portal_lock";

export interface PortalMetadata {
  id: PortalScope;
  name: string;
  shortName: string;
  description: string;
  homePath: string;
  loginPath: string;
  subdomainPrefix: string;
  productionDomainExample: string;
}

export const PORTAL_METADATA: Record<PortalScope, PortalMetadata> = {
  customer: {
    id: "customer",
    name: "Customer Storefront",
    shortName: "Customer",
    description: "Pure veg, vegan & Jain discovery, cart, checkout, and live tracking",
    homePath: "/",
    loginPath: "/login",
    subdomainPrefix: "",
    productionDomainExample: "veggoeats.in",
  },
  restaurant: {
    id: "restaurant",
    name: "Restaurant Partner App",
    shortName: "Restaurant",
    description: "Kitchen order queue, prep status, menu pricing, and 86 availability",
    homePath: "/restaurant",
    loginPath: "/restaurant/login",
    subdomainPrefix: "restaurant.",
    productionDomainExample: "restaurant.veggoeats.in",
  },
  partner: {
    id: "partner",
    name: "Delivery Partner App",
    shortName: "Delivery Partner",
    description: "Rider shift toggle, dispatch acceptance, pickup & drop-off workflow",
    homePath: "/partner",
    loginPath: "/partner/login",
    subdomainPrefix: "partner.",
    productionDomainExample: "partner.veggoeats.in",
  },
  admin: {
    id: "admin",
    name: "Org Admin Console",
    shortName: "Admin",
    description: "Platform ops, RBAC team roles, customer group rules, refunds & DLQ",
    homePath: "/admin",
    loginPath: "/admin/login",
    subdomainPrefix: "admin.",
    productionDomainExample: "admin.veggoeats.in",
  },
};

const ADMIN_PATH_RE = /^\/admin(?:$|[/?#])/;
const RESTAURANT_PATH_RE = /^\/restaurant(?:$|[/?#])/;
const PARTNER_PATH_RE = /^\/partner(?:$|[/?#])/;

const BYPASS_PREFIXES = [
  "/api/",
  "/_next/",
  "/assets/",
  "/opengraph-image",
  "/twitter-image",
];

const BYPASS_EXACT = new Set([
  "/favicon.ico",
  "/icon.svg",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
  "/manifest.json",
  "/__portal_blocked",
]);

const SHARED_LEGAL_PATHS = new Set(["/terms", "/privacy", "/refunds", "/contact"]);

const ADMIN_ROOT_SUBROUTES = new Set([
  "/login",
  "/accept",
  "/flags",
  "/deliveries",
  "/restaurants",
  "/refunds",
  "/dead-letters",
  "/team",
]);

const RESTAURANT_ROOT_SUBROUTES = new Set(["/login", "/menu"]);

const PARTNER_ROOT_SUBROUTES = new Set(["/login"]);

export function isPortalScope(value: unknown): value is PortalScope {
  return (
    value === "customer" ||
    value === "restaurant" ||
    value === "partner" ||
    value === "admin"
  );
}

/**
 * Parses NEXT_PUBLIC_APP_PORTAL (`customer` | `restaurant` | `partner` | `admin` | `all`).
 * Unset or unrecognized values default to `"all"` (multi-portal preview/dev mode).
 */
export function parsePortalEnv(raw?: string | null): PortalEnvSetting {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (isPortalScope(normalized)) return normalized;
  return "all";
}

function normalizeHost(host?: string | null): string {
  if (!host) return "";
  const first = host.split(",")[0]?.trim().toLowerCase() ?? "";
  return first.replace(/:\d+$/, "");
}

/**
 * Infers a locked portal scope from an HTTP hostname (Production Mode A: multi-subdomain).
 * Returns `null` on generic dev/preview hosts (localhost, *.run.app, *.sslip.io, *.vercel.app)
 * unless an explicit subdomain prefix (`restaurant.`, `partner.`, `admin.`, etc.) or
 * configured `customerHost` matches.
 */
export function resolvePortalFromHost(
  host?: string | null,
  customerHost?: string | null,
): PortalScope | null {
  const cleanHost = normalizeHost(host);
  if (!cleanHost) return null;

  if (cleanHost.startsWith("admin.")) return "admin";
  if (cleanHost.startsWith("restaurant.") || cleanHost.startsWith("kitchen.")) {
    return "restaurant";
  }
  if (
    cleanHost.startsWith("partner.") ||
    cleanHost.startsWith("rider.") ||
    cleanHost.startsWith("fleet.")
  ) {
    return "partner";
  }
  if (
    cleanHost.startsWith("customer.") ||
    cleanHost.startsWith("shop.") ||
    cleanHost.startsWith("order.")
  ) {
    return "customer";
  }

  const configuredCustomer = normalizeHost(customerHost);
  if (
    configuredCustomer &&
    (cleanHost === configuredCustomer || cleanHost === `www.${configuredCustomer}`)
  ) {
    return "customer";
  }

  return null;
}

export interface LockedPortalResolution {
  lockedPortal: PortalScope | null;
  source: PortalLockSource;
}

/**
 * Resolves whether the current runtime/request is locked to a single storefront.
 * Precedence:
 * 1. `NEXT_PUBLIC_APP_PORTAL` env var (Production Mode B: 4 separate deployments)
 * 2. Subdomain / configured customer host (Production Mode A: 4 subdomains on 1 server)
 * 3. Dev/preview cookie lock (`veggo_preview_portal_lock`) — ignored whenever env or host lock is active
 */
export function resolveLockedPortal(input: {
  envPortal?: string | null;
  host?: string | null;
  customerHost?: string | null;
  previewLockCookie?: string | null;
}): LockedPortalResolution {
  const envSetting = parsePortalEnv(input.envPortal);
  if (envSetting !== "all") {
    return { lockedPortal: envSetting, source: "env" };
  }

  const hostPortal = resolvePortalFromHost(input.host, input.customerHost);
  if (hostPortal) {
    return { lockedPortal: hostPortal, source: "host" };
  }

  const previewCookie = (input.previewLockCookie ?? "").trim().toLowerCase();
  if (isPortalScope(previewCookie)) {
    return { lockedPortal: previewCookie, source: "preview_lock" };
  }

  return { lockedPortal: null, source: "none" };
}

/** Returns true when a pathname belongs to a shared legal/support page reachable from all portals. */
export function isSharedLegalPath(pathname: string): boolean {
  const clean = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return SHARED_LEGAL_PATHS.has(clean);
}

/** Returns true for API routes, static assets, and Next.js internals that always bypass portal blocking. */
export function isPortalBypassPath(pathname: string): boolean {
  if (BYPASS_EXACT.has(pathname)) return true;
  return BYPASS_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export type PortalMiddlewareDecision =
  | { action: "allow"; portal: PortalScope }
  | { action: "rewrite"; destination: string; portal: PortalScope }
  | { action: "block_404"; portal: PortalScope };

function stripTrailingSlash(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname || "/";
}

function resolvePathOwner(pathname: string): PortalScope {
  if (ADMIN_PATH_RE.test(pathname)) return "admin";
  if (RESTAURANT_PATH_RE.test(pathname)) return "restaurant";
  if (PARTNER_PATH_RE.test(pathname)) return "partner";
  return "customer";
}

/**
 * Pure decision function for Next.js Edge Middleware.
 * Enforces strict 4-storefront segregation whenever `lockedPortal` is active:
 * - Blocks all cross-portal routes with HTTP 404.
 * - Rewrites clean root-relative URLs on dedicated portal deployments/subdomains
 *   (e.g. `restaurant.veggoeats.in/menu` -> `/restaurant/menu`, `/` -> `/restaurant`).
 */
export function evaluatePortalMiddleware(input: {
  pathname: string;
  lockedPortal: PortalScope | null;
}): PortalMiddlewareDecision {
  const rawPath = input.pathname || "/";
  const cleanPath = stripTrailingSlash(rawPath);

  if (isPortalBypassPath(cleanPath)) {
    return { action: "allow", portal: input.lockedPortal ?? resolvePathOwner(cleanPath) };
  }

  if (!input.lockedPortal) {
    return { action: "allow", portal: resolvePathOwner(cleanPath) };
  }

  if (isSharedLegalPath(cleanPath)) {
    return { action: "allow", portal: input.lockedPortal };
  }

  switch (input.lockedPortal) {
    case "customer": {
      if (
        ADMIN_PATH_RE.test(cleanPath) ||
        RESTAURANT_PATH_RE.test(cleanPath) ||
        PARTNER_PATH_RE.test(cleanPath)
      ) {
        return { action: "block_404", portal: "customer" };
      }
      return { action: "allow", portal: "customer" };
    }

    case "restaurant": {
      if (RESTAURANT_PATH_RE.test(cleanPath)) {
        return { action: "allow", portal: "restaurant" };
      }
      if (cleanPath === "/") {
        return { action: "rewrite", destination: "/restaurant", portal: "restaurant" };
      }
      if (RESTAURANT_ROOT_SUBROUTES.has(cleanPath)) {
        return { action: "rewrite", destination: `/restaurant${cleanPath}`, portal: "restaurant" };
      }
      return { action: "block_404", portal: "restaurant" };
    }

    case "partner": {
      if (PARTNER_PATH_RE.test(cleanPath)) {
        return { action: "allow", portal: "partner" };
      }
      if (cleanPath === "/") {
        return { action: "rewrite", destination: "/partner", portal: "partner" };
      }
      if (PARTNER_ROOT_SUBROUTES.has(cleanPath)) {
        return { action: "rewrite", destination: `/partner${cleanPath}`, portal: "partner" };
      }
      return { action: "block_404", portal: "partner" };
    }

    case "admin": {
      if (ADMIN_PATH_RE.test(cleanPath)) {
        return { action: "allow", portal: "admin" };
      }
      if (cleanPath === "/") {
        return { action: "rewrite", destination: "/admin", portal: "admin" };
      }
      if (ADMIN_ROOT_SUBROUTES.has(cleanPath)) {
        return { action: "rewrite", destination: `/admin${cleanPath}`, portal: "admin" };
      }
      return { action: "block_404", portal: "admin" };
    }
  }
}

function sanitizeHttpUrl(raw?: string | null): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString().replace(/\/$/, "");
    }
  } catch {
    /* ignore malformed external URL */
  }
  return null;
}

export type ExternalPortalUrls = Partial<Record<PortalScope, string>>;

/**
 * Reads optional cross-domain storefront URLs from public env vars.
 * When unset, Customer footer hides internal partner links for strict portal separation.
 */
export function resolveExternalPortalUrls(env?: {
  NEXT_PUBLIC_CUSTOMER_PORTAL_URL?: string;
  NEXT_PUBLIC_RESTAURANT_PORTAL_URL?: string;
  NEXT_PUBLIC_PARTNER_PORTAL_URL?: string;
  NEXT_PUBLIC_ADMIN_PORTAL_URL?: string;
}): ExternalPortalUrls {
  const source = env ?? (typeof process !== "undefined" ? process.env : {});
  const urls: ExternalPortalUrls = {};
  const customer = sanitizeHttpUrl(source.NEXT_PUBLIC_CUSTOMER_PORTAL_URL);
  const restaurant = sanitizeHttpUrl(source.NEXT_PUBLIC_RESTAURANT_PORTAL_URL);
  const partner = sanitizeHttpUrl(source.NEXT_PUBLIC_PARTNER_PORTAL_URL);
  const admin = sanitizeHttpUrl(source.NEXT_PUBLIC_ADMIN_PORTAL_URL);
  if (customer) urls.customer = customer;
  if (restaurant) urls.restaurant = restaurant;
  if (partner) urls.partner = partner;
  if (admin) urls.admin = admin;
  return urls;
}

/** Reads the preview lock cookie in browser contexts. */
export function readPreviewLockCookie(cookieHeader?: string | null): PortalScope | null {
  const raw =
    cookieHeader !== undefined
      ? cookieHeader
      : typeof document !== "undefined"
        ? document.cookie
        : "";
  if (!raw) return null;
  const parts = raw.split(";");
  for (const part of parts) {
    const [k, ...rest] = part.trim().split("=");
    if (k === PREVIEW_LOCK_COOKIE) {
      const value = decodeURIComponent(rest.join("=")).trim().toLowerCase();
      return isPortalScope(value) ? value : null;
    }
  }
  return null;
}

/**
 * Resolves the effective portal scope in the browser, honoring production env/host locks
 * before falling back to URL pathname inspection.
 */
export function resolveClientPortalState(pathname?: string | null): {
  activePortal: PortalScope;
  lockedPortal: PortalScope | null;
  lockSource: PortalLockSource;
  showDevSwitcher: boolean;
} {
  const envPortal = process.env.NEXT_PUBLIC_APP_PORTAL;
  const customerHost = process.env.NEXT_PUBLIC_CUSTOMER_HOST;
  const host = typeof window !== "undefined" ? window.location.host : null;
  const previewLockCookie = readPreviewLockCookie();

  const { lockedPortal, source } = resolveLockedPortal({
    envPortal,
    host,
    customerHost,
    previewLockCookie,
  });

  const activePortal = lockedPortal ?? resolvePathOwner(pathname ?? "/");
  // Show the switcher bar only in dev/preview (never when locked by production env or subdomain host)
  const showDevSwitcher = source === "none" || source === "preview_lock";

  return {
    activePortal,
    lockedPortal,
    lockSource: source,
    showDevSwitcher,
  };
}
