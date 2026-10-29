const BASE = "http://redirect.invalid";

/**
 * Validates a post-login destination taken from the URL (?next=). Only same-site paths are allowed.
 * Browsers treat "\" like "/" and drop tabs and newlines, so "/\evil.com" and "/<tab>/evil.com" would
 * otherwise leave the site; any backslash or control character is rejected, and the result is re-parsed
 * to make sure it stays on the same origin.
 */
export function safeInternalPath(raw: string | null | undefined, fallback = "/"): string {
  if (!raw || !raw.startsWith("/")) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return fallback;
  try {
    const u = new URL(raw, BASE);
    if (u.origin !== BASE) return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}
