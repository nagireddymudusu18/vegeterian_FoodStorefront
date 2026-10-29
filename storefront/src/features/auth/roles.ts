import { safeInternalPath } from "./redirect";

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

/** Only same-site /admin paths are allowed as a post-login destination. */
export function safeAdminNext(next: string | null | undefined): string {
  const path = safeInternalPath(next, "/admin");
  return path.startsWith("/admin") && !path.startsWith("/admin/login") && !path.startsWith("/admin/accept") ? path : "/admin";
}
