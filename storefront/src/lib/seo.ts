import { BRAND } from "./brand";

type Env = Record<string, string | undefined>;

/** Public origin of the storefront, without a trailing slash. Inlined at build time. */
export function siteUrl(env: Env = process.env): string {
  const raw = (env.NEXT_PUBLIC_SITE_URL || `https://${BRAND.domain}`).trim();
  return raw.replace(/\/+$/, "");
}

/** Search engines may index the site only when NEXT_PUBLIC_ALLOW_INDEXING=true (production). Sandboxes stay hidden. */
export function indexingEnabled(env: Env = process.env): boolean {
  return env.NEXT_PUBLIC_ALLOW_INDEXING === "true";
}

/** Public pages that belong in the sitemap. */
export const PUBLIC_PATHS = ["/", "/contact", "/privacy", "/terms", "/refunds"] as const;

/** Areas that need a sign-in or show private data: never indexed, even in production. */
export const PRIVATE_PREFIXES = [
  "/admin",
  "/partner",
  "/restaurant",
  "/cart",
  "/checkout",
  "/orders",
  "/profile",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/track",
  "/notifications",
] as const;

/** Serialises JSON-LD for a script tag; "<" is escaped so data can never close the tag. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
