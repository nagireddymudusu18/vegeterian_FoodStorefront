import { safeInternalPath } from "./redirect";
import { isValidAccountDomain, resolveAccountDomain, type AccountDomain } from "../customer-groups/rules";

export type PortalScope = "customer" | "admin" | "restaurant" | "partner";

const ADMIN_PATH_RE = /^\/admin(?:$|[/?#])/;
const RESTAURANT_PATH_RE = /^\/restaurant(?:$|[/?#])/;
const PARTNER_PATH_RE = /^\/partner(?:$|[/?#])/;

/** Resolves which of the four decoupled portals owns a given URL pathname. */
export function resolvePortalScope(pathname: string | null | undefined): PortalScope {
  if (!pathname) return "customer";
  if (ADMIN_PATH_RE.test(pathname)) return "admin";
  if (RESTAURANT_PATH_RE.test(pathname)) return "restaurant";
  if (PARTNER_PATH_RE.test(pathname)) return "partner";
  return "customer";
}

/** Maps a portal scope (plus optional hostname) to its isolated AccountDomain flag. */
export function scopeToAccountDomain(scope: PortalScope, hostname?: string | null): AccountDomain {
  switch (scope) {
    case "admin":
      return "ADMIN";
    case "restaurant":
      return "RESTAURANT_OWNER";
    case "partner":
      return "DELIVERY_PARTNER";
    default:
      return resolveAccountDomain({ hostname, pathname: "/" });
  }
}

/** Returns the dedicated sign-in route for a portal scope. */
export function portalLoginPath(scope: PortalScope): string {
  switch (scope) {
    case "admin":
      return "/admin/login";
    case "restaurant":
      return "/restaurant/login";
    case "partner":
      return "/partner/login";
    default:
      return "/login";
  }
}

/**
 * Roles carried by an access token. The server trusts this claim (not /me), so the admin screens use it
 * to tell an admin sign-in apart from an ordinary session of an account that happens to be an admin.
 * It only decides what to show; the server enforces access on every request.
 */
export function rolesFromAccessToken(token: string | null | undefined): string[] {
  const payload = token?.split(".")[1];
  if (!payload) return [];
  try {
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "="));
    const claims = JSON.parse(json) as { roles?: unknown };
    return Array.isArray(claims.roles) ? claims.roles.filter((r): r is string => typeof r === "string") : [];
  } catch {
    return [];
  }
}

/** Extracts the accountDomain claim from a JWT access token if present. */
export function accountDomainFromAccessToken(token: string | null | undefined): AccountDomain | null {
  const payload = token?.split(".")[1];
  if (!payload) return null;
  try {
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "="));
    const claims = JSON.parse(json) as { accountDomain?: unknown };
    return isValidAccountDomain(claims.accountDomain) ? claims.accountDomain : null;
  } catch {
    return null;
  }
}

/** Only same-site /admin paths are allowed as a post-login destination. */
export function safeAdminNext(next: string | null | undefined): string {
  const path = safeInternalPath(next, "/admin");
  return ADMIN_PATH_RE.test(path) && !path.startsWith("/admin/login") && !path.startsWith("/admin/accept") ? path : "/admin";
}

/** Only same-site /restaurant paths (excluding /restaurant/login and customer /restaurants/*) are allowed as a post-login destination. */
export function safeRestaurantNext(next: string | null | undefined): string {
  const path = safeInternalPath(next, "/restaurant");
  return RESTAURANT_PATH_RE.test(path) && !path.startsWith("/restaurant/login") ? path : "/restaurant";
}

/** Only same-site /partner paths (excluding /partner/login) are allowed as a post-login destination. */
export function safePartnerNext(next: string | null | undefined): string {
  const path = safeInternalPath(next, "/partner");
  return PARTNER_PATH_RE.test(path) && !path.startsWith("/partner/login") ? path : "/partner";
}
