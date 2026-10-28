/** Access/refresh token holder: in memory + localStorage (see README: BFF with httpOnly cookies is a later hardening step). */

const KEY = "sf.tokens.v1";

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  /** epoch ms when the access token expires (informational) */
  expiresAt?: number;
}

let memory: Tokens | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function load(): Tokens | null {
  if (loaded || typeof window === "undefined") return memory;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as Tokens;
      if (typeof v.accessToken === "string" && typeof v.refreshToken === "string") memory = v;
    }
  } catch {
    memory = null;
  }
  return memory;
}

export function getTokens(): Tokens | null {
  return load();
}

export function setTokens(t: Tokens | null): void {
  loaded = true;
  memory = t;
  if (typeof window !== "undefined") {
    try {
      if (t) window.localStorage.setItem(KEY, JSON.stringify(t));
      else window.localStorage.removeItem(KEY);
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
