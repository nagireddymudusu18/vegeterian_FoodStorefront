export function validateEmail(v: string): boolean {
  const s = v.trim();
  return s.length <= 254 && /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

/** Mirrors the server rule: 8+ characters, at least one letter and one digit, at most 72 bytes. */
export function passwordProblem(p: string): string | null {
  if (p.length < 8) return "Password must be at least 8 characters.";
  if (new TextEncoder().encode(p).length > 72) return "Password is too long.";
  if (!/\p{L}/u.test(p) || !/\d/.test(p)) return "Password must contain at least one letter and one digit.";
  return null;
}
