import { getTokens, setTokens } from "./tokens";

export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080").replace(/\/+$/, "");

export type Service = "identity" | "catalog" | "orders" | "payments" | "fleet" | "notifications";
export type Diet = "PURE_VEG" | "VEGAN" | "JAIN";

// ---------- Types ----------

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface Me {
  id: string;
  name?: string | null;
  /** Masked, e.g. +91*****43210; absent for accounts registered with email only. */
  phone?: string | null;
  /** Masked, e.g. a***@example.com. */
  email?: string | null;
  emailVerified?: boolean;
  hasPassword: boolean;
  roles: string[];
}

/** Public, unauthenticated view returned by order tracking. */
export interface TrackedOrder {
  orderNumber: string;
  restaurantName: string;
  status: string;
  totalPaise: number;
  items: { name: string; quantity: number }[];
  timeline: { status: string; at: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface Restaurant {
  id: string;
  name: string;
  distanceMeters?: number;
  kitchenCertificationLevel?: string | number | null;
  open: boolean;
  cuisine?: string;
  address?: string;
  fssaiNumber?: string;
  menu?: MenuItem[];
  [k: string]: unknown;
}

export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  pricePaise: number;
  isPureVeg: boolean;
  isVegan: boolean;
  isJain: boolean;
  available: boolean;
  ingredients?: string[] | string | null;
  containsAllergens?: string[] | string | null;
}

export interface OrderItem {
  itemId?: string;
  name?: string;
  quantity: number;
  unitPricePaise?: number;
  pricePaise?: number;
  linePaise?: number;
  [k: string]: unknown;
}

export interface Order {
  id: string;
  /** Human-friendly, e.g. FA-7K3M9-QX2RA. Used for public tracking. */
  orderNumber?: string;
  status: string;
  restaurantId?: string;
  restaurantName?: string;
  subtotalPaise: number;
  taxPaise: number;
  deliveryFeePaise: number;
  totalPaise: number;
  items?: OrderItem[];
  deliveryOtp?: string | null;
  createdAt?: string;
  [k: string]: unknown;
}

export interface Payment {
  id: string;
  status: string;
  [k: string]: unknown;
}

// ---------- Errors ----------

export class ApiError extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail?: string;
  /** The X-Request-Id the server answered with; quote it to support to find the request in the logs. */
  readonly requestId?: string;

  constructor(status: number, title: string, detail?: string, requestId?: string) {
    super(detail ? `${title}: ${detail}` : title);
    this.name = "ApiError";
    this.status = status;
    this.title = title;
    this.detail = detail;
    this.requestId = requestId;
  }
}

/** Human-friendly message for any thrown value. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.detail ? `${e.title}. ${e.detail}` : e.title;
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}

/** The request id to show for a server-side failure (5xx) so it can be quoted to support; undefined otherwise. */
export function errorReference(e: unknown): string | undefined {
  return e instanceof ApiError && e.status >= 500 ? e.requestId : undefined;
}

/** A fresh id for the X-Request-Id header; matches what the services accept (letters, digits, . _ -, 8 to 64 long). */
export function newRequestId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function toApiError(res: Response): Promise<ApiError> {
  let title = res.statusText || `HTTP ${res.status}`;
  let detail: string | undefined;
  try {
    const text = await res.text();
    if (text) {
      try {
        const p = JSON.parse(text) as { title?: string; detail?: string; message?: string };
        title = p.title || title;
        detail = p.detail || p.message;
      } catch {
        detail = text.slice(0, 300);
      }
    }
  } catch {
    /* ignore */
  }
  return new ApiError(res.status, title, detail, res.headers.get("X-Request-Id") ?? undefined);
}

// ---------- Core request ----------

interface ReqOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  auth?: boolean;
  idempotencyKey?: string;
  query?: Record<string, string | number | undefined | null>;
  signal?: AbortSignal;
}

function buildUrl(service: Service, path: string, query?: ReqOptions["query"]): string {
  const url = `${API_BASE}/api/${service}${path}`;
  if (!query) return url;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `${url}?${s}` : url;
}

async function send(service: Service, path: string, o: ReqOptions, token?: string): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/json, application/problem+json",
    "X-Request-Id": newRequestId(),
  };
  if (o.body !== undefined) headers["Content-Type"] = "application/json";
  if (o.idempotencyKey) headers["Idempotency-Key"] = o.idempotencyKey;
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    return await fetch(buildUrl(service, path, o.query), {
      method: o.method ?? "GET",
      headers,
      body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
      signal: o.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(0, "Cannot reach the server", "Check your connection and try again.");
  }
}

let refreshing: Promise<boolean> | null = null;

/** One shared refresh attempt; resolves true when new tokens were stored. */
function refreshTokens(): Promise<boolean> {
  if (refreshing) return refreshing;
  const current = getTokens();
  if (!current) return Promise.resolve(false);
  refreshing = (async () => {
    try {
      const res = await send("identity", "/auth/refresh", {
        method: "POST",
        body: { refreshToken: current.refreshToken },
      });
      if (!res.ok) return false;
      const t = (await res.json()) as TokenResponse;
      setTokens({
        accessToken: t.accessToken,
        refreshToken: t.refreshToken || current.refreshToken,
        expiresAt: Date.now() + t.expiresIn * 1000,
      });
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Fetches a fresh access token, e.g. after the account gained a role. */
export const refreshSession = refreshTokens;

export function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  const here = window.location.pathname + window.location.search;
  if (window.location.pathname.startsWith("/login")) return;
  if (window.location.pathname.startsWith("/admin")) {
    // admins sign in on their own page, and the invite page is reachable without a session
    if (/^\/admin\/(login|accept)/.test(window.location.pathname)) return;
    window.location.assign(`/admin/login?next=${encodeURIComponent(here)}`);
    return;
  }
  window.location.assign(`/login?next=${encodeURIComponent(here)}`);
}

async function request<T>(service: Service, path: string, o: ReqOptions = {}): Promise<T> {
  const auth = o.auth ?? false;
  let res = await send(service, path, o, auth ? getTokens()?.accessToken : undefined);

  if (auth && res.status === 401) {
    if (await refreshTokens()) {
      res = await send(service, path, o, getTokens()?.accessToken);
    }
    if (res.status === 401) {
      setTokens(null);
      redirectToLogin();
      throw new ApiError(401, "Session expired", "Please sign in again.");
    }
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// ---------- Identity ----------

const CONSENT = { purpose: "TERMS_AND_PRIVACY", version: "1", granted: true } as const;

function storeTokens(t: TokenResponse): TokenResponse {
  setTokens({
    accessToken: t.accessToken,
    refreshToken: t.refreshToken,
    expiresAt: Date.now() + t.expiresIn * 1000,
  });
  return t;
}

export const identity = {
  requestOtp: (phone: string) =>
    request<void>("identity", "/auth/otp/request", { method: "POST", body: { phone } }),

  /** Signs in, or registers on first use. `name` is stored when the account has none (guest checkout). */
  async verifyOtp(phone: string, code: string, name?: string): Promise<TokenResponse> {
    const trimmed = name?.trim();
    return storeTokens(
      await request<TokenResponse>("identity", "/auth/otp/verify", {
        method: "POST",
        body: { phone, code, consent: CONSENT, ...(trimmed ? { name: trimmed } : {}) },
      }),
    );
  },

  /** Creates the account and emails a verification link; the user is not signed in until they open it. */
  register: (name: string, email: string, password: string) =>
    request<void>("identity", "/auth/register", {
      method: "POST",
      body: { name: name.trim(), email: email.trim(), password, consent: CONSENT },
    }),

  async verifyEmail(token: string, password: string): Promise<TokenResponse> {
    return storeTokens(await request<TokenResponse>("identity", "/auth/email/verify", { method: "POST", body: { token, password } }));
  },

  resendVerification: (email: string) =>
    request<void>("identity", "/auth/email/resend", { method: "POST", body: { email: email.trim() } }),

  forgotPassword: (email: string) =>
    request<void>("identity", "/auth/password/forgot", { method: "POST", body: { email: email.trim() } }),

  resetPassword: (token: string, password: string) =>
    request<void>("identity", "/auth/password/reset", { method: "POST", body: { token, password } }),

  requestPhoneOtp: (phone: string) =>
    request<void>("identity", "/me/phone/request", { method: "POST", auth: true, body: { phone } }),

  verifyPhone: (phone: string, code: string) =>
    request<void>("identity", "/me/phone/verify", { method: "POST", auth: true, body: { phone, code } }),
  async loginWithPassword(email: string, password: string): Promise<TokenResponse> {
    return storeTokens(
      await request<TokenResponse>("identity", "/auth/login", {
        method: "POST",
        body: { email: email.trim(), password },
      }),
    );
  },

  addCredentials: (email: string, password: string) =>
    request<void>("identity", "/me/credentials", { method: "POST", auth: true, body: { email: email.trim(), password } }),

  /**
   * Admin sign-in (email and password only). Resolves to `{}` once signed in, or `{ challengeId }` when an
   * emailed code is also required; finish that with adminVerifyCode.
   */
  async adminLogin(email: string, password: string): Promise<{ challengeId?: string }> {
    const r = await request<{ tokens?: TokenResponse; challengeId?: string }>("identity", "/auth/admin/login", {
      method: "POST",
      body: { email: email.trim(), password },
    });
    if (r.tokens) {
      storeTokens(r.tokens);
      return {};
    }
    return { challengeId: r.challengeId };
  },

  async adminVerifyCode(challengeId: string, code: string): Promise<TokenResponse> {
    return storeTokens(
      await request<TokenResponse>("identity", "/auth/admin/login/verify", {
        method: "POST",
        body: { challengeId, code: code.trim() },
      }),
    );
  },

  acceptAdminInvite: (token: string, email: string, password: string) =>
    request<void>("identity", "/auth/admin/invite/accept", {
      method: "POST",
      body: { token, email: email.trim(), password },
    }),

  me: () => request<Me>("identity", "/me", { auth: true }),
  isAdmin: (me: Me | null) => !!me?.roles?.includes("ADMIN"),
  isSuperAdmin: (me: Me | null) => !!me?.roles?.includes("SUPER_ADMIN"),
  deleteMe: () => request<void>("identity", "/me", { method: "DELETE", auth: true }),
};
// ---------- Catalog ----------

export interface RestaurantQuery {
  lat: number;
  lng: number;
  radiusMeters?: number;
  diet?: Diet | null;
  q?: string;
}

export const catalog = {
  restaurants: (p: RestaurantQuery, signal?: AbortSignal) =>
    request<Restaurant[]>("catalog", "/restaurants", {
      query: { lat: p.lat, lng: p.lng, radiusMeters: p.radiusMeters ?? 5000, diet: p.diet, q: p.q },
      signal,
    }),
  restaurant: (id: string, signal?: AbortSignal) =>
    request<Restaurant>("catalog", `/restaurants/${encodeURIComponent(id)}`, { signal }),
  menu: (id: string, diet?: Diet | null, signal?: AbortSignal) =>
    request<MenuItem[]>("catalog", `/restaurants/${encodeURIComponent(id)}/menu`, { query: { diet }, signal }),
};

// ---------- Orders ----------

export const orders = {
  /** Sends only ids and quantities; the server computes every price. */
  create: (restaurantId: string, lines: { itemId: string; quantity: number }[], idempotencyKey: string) =>
    request<Order>("orders", "/orders", {
      method: "POST",
      auth: true,
      idempotencyKey,
      body: { restaurantId, lines },
    }),
  get: (id: string, signal?: AbortSignal) =>
    request<Order>("orders", `/orders/${encodeURIComponent(id)}`, { auth: true, signal }),
  async list(signal?: AbortSignal): Promise<Order[]> {
    const r = await request<Order[] | { content?: Order[]; items?: Order[]; orders?: Order[] }>("orders", "/orders", {
      auth: true,
      signal,
    });
    if (Array.isArray(r)) return r;
    return r?.content ?? r?.items ?? r?.orders ?? [];
  },
  /** Public lookup by order number; no sign-in needed. */
  track: (orderNumber: string, signal?: AbortSignal) =>
    request<TrackedOrder>("orders", `/orders/track/${encodeURIComponent(orderNumber.trim())}`, { signal }),
  cancel: (id: string) =>
    request<Order | undefined>("orders", `/orders/${encodeURIComponent(id)}/cancel`, { method: "POST", auth: true }),
};

// ---------- Restaurant staff ----------

export interface StaffOrder {
  id: string;
  orderNumber: string;
  restaurantName: string | null;
  status: string;
  totalPaise: number;
  items: { name: string; quantity: number }[];
  createdAt: string;
  updatedAt: string;
}

export const staffOrders = {
  list: (history: boolean, signal?: AbortSignal) =>
    request<StaffOrder[]>("orders", "/orders/restaurant", { auth: true, query: { history: String(history) }, signal }),
  accept: (id: string) =>
    request<unknown>("orders", `/orders/${encodeURIComponent(id)}/accept`, { method: "POST", auth: true }),
  reject: (id: string) =>
    request<unknown>("orders", `/orders/${encodeURIComponent(id)}/reject`, { method: "POST", auth: true }),
  preparing: (id: string) =>
    request<unknown>("orders", `/orders/${encodeURIComponent(id)}/preparing`, { method: "POST", auth: true }),
};

// ---------- Payments ----------

export const payments = {
  create: (orderId: string, amountPaise: number, idempotencyKey: string) =>
    request<Payment>("payments", "/payments", {
      method: "POST",
      auth: true,
      idempotencyKey,
      body: { orderId, amountPaise },
    }),
};

// ---------- Admin team (main admin only) ----------

export interface TeamMember {
  userId: string;
  name?: string | null;
  /** Masked, e.g. a***@example.com. */
  email: string;
  main: boolean;
}

export interface TeamInvite {
  id: string;
  email: string;
  expiresAt: string;
}

export const adminTeam = {
  get: () => request<{ members: TeamMember[]; invites: TeamInvite[] }>("identity", "/admin/team", { auth: true }),
  invite: (email: string) =>
    request<void>("identity", "/admin/team/invites", { method: "POST", auth: true, body: { email: email.trim() } }),
  revokeInvite: (id: string) =>
    request<void>("identity", `/admin/team/invites/${encodeURIComponent(id)}`, { method: "DELETE", auth: true }),
  removeMember: (userId: string) =>
    request<void>("identity", `/admin/team/members/${encodeURIComponent(userId)}`, { method: "DELETE", auth: true }),
};

// ---------- Feature flags ----------

export interface AdminFlag {
  key: string;
  enabled: boolean;
  description: string;
  updatedAt: string;
  updatedBy?: string | null;
}

export const flagsApi = {
  get: () => request<Record<string, boolean>>("identity", "/flags"),
  list: () => request<AdminFlag[]>("identity", "/admin/flags", { auth: true }),
  set: (key: string, enabled: boolean) =>
    request<AdminFlag>("identity", `/admin/flags/${encodeURIComponent(key)}`, {
      method: "PUT",
      auth: true,
      body: { enabled },
    }),
};

// ---------- Delivery partners (fleet) ----------

export type DeliveryStatus = "AVAILABLE" | "ASSIGNED" | "PICKED_UP" | "DELIVERED" | "CANCELLED";

export interface Delivery {
  orderId: string;
  orderNumber: string;
  restaurantName?: string | null;
  status: DeliveryStatus;
  partnerId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Partner {
  userId: string;
  name: string;
  vehicle: string;
  online: boolean;
  activeDeliveries: number;
}

export interface RiderOrder {
  id: string;
  orderNumber: string;
  status: string;
}

export const fleetApi = {
  becomePartner: () => request<void>("identity", "/me/partner", { method: "POST", auth: true }),
  register: (name: string, vehicle: string) =>
    request<Partner>("fleet", "/fleet/partners/me", { method: "POST", auth: true, body: { name, vehicle } }),
  me: (signal?: AbortSignal) => request<Partner>("fleet", "/fleet/me", { auth: true, signal }),
  setOnline: (online: boolean) =>
    request<Partner>("fleet", "/fleet/me/online", { method: "PUT", auth: true, body: { online } }),
  pool: (signal?: AbortSignal) => request<Delivery[]>("fleet", "/fleet/pool", { auth: true, signal }),
  mine: (signal?: AbortSignal) => request<Delivery[]>("fleet", "/fleet/me/deliveries", { auth: true, signal }),
  accept: (orderId: string) =>
    request<Delivery>("fleet", `/fleet/deliveries/${encodeURIComponent(orderId)}/accept`, {
      method: "POST",
      auth: true,
    }),
  /** Order-service owns the order status; the partner acts on it directly and fleet mirrors the result. */
  pickedUp: (orderId: string) =>
    request<RiderOrder>("orders", `/orders/${encodeURIComponent(orderId)}/rider/picked-up`, {
      method: "POST",
      auth: true,
    }),
  deliver: (orderId: string, otp: string) =>
    request<RiderOrder>("orders", `/orders/${encodeURIComponent(orderId)}/rider/deliver`, {
      method: "POST",
      auth: true,
      body: { otp },
    }),
  admin: {
    deliveries: (status?: string, signal?: AbortSignal) =>
      request<Delivery[]>("fleet", "/fleet/admin/deliveries", { auth: true, query: { status }, signal }),
    partners: (signal?: AbortSignal) => request<Partner[]>("fleet", "/fleet/admin/partners", { auth: true, signal }),
    assign: (orderId: string, partnerId: string) =>
      request<Delivery>("fleet", `/fleet/admin/deliveries/${encodeURIComponent(orderId)}/assign`, {
        method: "POST",
        auth: true,
        body: { partnerId },
      }),
  },
};

// ---------- Notifications ----------

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  orderId?: string | null;
  createdAt: string;
  read: boolean;
}

export interface Inbox {
  unread: number;
  items: AppNotification[];
}

export const notificationsApi = {
  inbox: (limit = 20, signal?: AbortSignal) =>
    request<Inbox>("notifications", "/notifications", { auth: true, query: { limit }, signal }),
  unread: (signal?: AbortSignal) =>
    request<{ unread: number }>("notifications", "/notifications/unread-count", { auth: true, signal }),
  markRead: (id: string) =>
    request<void>("notifications", `/notifications/${encodeURIComponent(id)}/read`, { method: "POST", auth: true }),
  markAllRead: () => request<void>("notifications", "/notifications/read-all", { method: "POST", auth: true }),
};