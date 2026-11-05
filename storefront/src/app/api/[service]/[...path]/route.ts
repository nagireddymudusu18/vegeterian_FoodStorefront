import { NextRequest, NextResponse } from "next/server";
import type { DeadLetterService, Diet, MenuItemPayload } from "@/lib/api";
import {
  cancelOrderByCustomer,
  createOrderForUser,
  createPaymentForOrder,
  createRestaurant,
  getAdminTeam,
  getBackendState,
  getPaymentById,
  getRestaurantById,
  getRestaurantMenu,
  getUserInbox,
  HttpProblem,
  listAdminUsers,
  listStaffOrders,
  loginEmailUser,
  refundPaymentById,
  refreshUserSession,
  registerEmailUser,
  requireUser,
  searchRestaurants,
  setAdminUserRole,
  setBulkMenuItemAvailability,
  setBulkMenuItemPrices,
  setMenuItemAvailability,
  setRestaurantStatus,
  toMe,
  trackOrderByNumber,
  transitionOrderByStaff,
  upsertMenuItem,
  verifyOtpLogin,
} from "@/lib/mock-backend";

type RouteContext = { params: Promise<{ service: string; path: string[] }> };

function problemResponse(err: unknown): NextResponse {
  if (err instanceof HttpProblem) {
    return NextResponse.json(
      { title: err.title, detail: err.detail, status: err.status },
      { status: err.status },
    );
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  return NextResponse.json({ title: "Internal Server Error", detail: message, status: 500 }, { status: 500 });
}

function sseResponse(initialFrames: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const frame of initialFrames) {
        controller.enqueue(encoder.encode(frame));
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

async function handle(req: NextRequest, ctx: RouteContext): Promise<Response> {
  try {
    const { service, path } = await ctx.params;
    const method = req.method.toUpperCase();
    const joined = "/" + (path ?? []).join("/");
    const authHeader = req.headers.get("authorization");
    const state = getBackendState();

    // ---------- IDENTITY SERVICE ----------
    if (service === "identity") {
      if (method === "GET" && joined === "/flags") {
        const out: Record<string, boolean> = {};
        for (const [k, v] of state.flags.entries()) out[k] = v.enabled;
        return NextResponse.json(out, {
          headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=60" },
        });
      }

      if (method === "GET" && joined === "/admin/flags") {
        requireUser(authHeader);
        return NextResponse.json([...state.flags.values()]);
      }

      if (method === "POST" && joined === "/admin/contacts/backfill") {
        requireUser(authHeader);
        const published = [...state.users.values()].filter(
          (u) => Boolean(u.phone) || (Boolean(u.email) && u.emailVerified),
        ).length;
        return NextResponse.json({ published });
      }

      if (method === "PUT" && path[0] === "admin" && path[1] === "flags" && path[2]) {
        const user = requireUser(authHeader);
        const key = decodeURIComponent(path[2]);
        const flag = state.flags.get(key);
        if (!flag) throw new HttpProblem(404, "Flag not found");
        const body = (await req.json()) as { enabled?: boolean };
        flag.enabled = Boolean(body.enabled);
        flag.updatedAt = new Date().toISOString();
        flag.updatedBy = user.id;
        return NextResponse.json(flag);
      }

      if (method === "POST" && joined === "/auth/otp/request") {
        return new NextResponse(null, { status: 204 });
      }

      if (method === "POST" && joined === "/auth/otp/verify") {
        const body = (await req.json()) as { phone?: string; code?: string; name?: string };
        return NextResponse.json(verifyOtpLogin(body.phone ?? "", body.code ?? "", body.name));
      }

      if (method === "POST" && joined === "/auth/register") {
        const body = (await req.json()) as { name?: string; email?: string; password?: string };
        registerEmailUser(body.name ?? "", body.email ?? "", body.password ?? "");
        return new NextResponse(null, { status: 202 });
      }

      if (method === "POST" && joined === "/auth/email/verify") {
        const body = (await req.json()) as { token?: string; password?: string };
        const userId = state.emailTokens.get(body.token ?? "");
        const user = userId ? state.users.get(userId) : [...state.users.values()][0];
        if (!user) throw new HttpProblem(400, "Invalid or expired verification link");
        user.emailVerified = true;
        return NextResponse.json(loginEmailUser(user.email ?? "user@example.com", body.password ?? ""));
      }

      if (
        method === "POST" &&
        (joined === "/auth/email/resend" ||
          joined === "/auth/password/forgot" ||
          joined === "/auth/password/reset" ||
          joined === "/auth/admin/invite/accept")
      ) {
        return new NextResponse(null, { status: 204 });
      }

      if (method === "POST" && joined === "/auth/login") {
        const body = (await req.json()) as { email?: string; password?: string };
        return NextResponse.json(loginEmailUser(body.email ?? "", body.password ?? ""));
      }

      if (method === "POST" && joined === "/auth/admin/login") {
        const body = (await req.json()) as { email?: string; password?: string };
        const tokens = loginEmailUser(body.email ?? "", body.password ?? "");
        return NextResponse.json({ tokens });
      }

      if (method === "POST" && joined === "/auth/admin/login/verify") {
        const user =
          [...state.users.values()].find((u) => u.roles.includes("ADMIN")) ??
          [...state.users.values()][0];
        return NextResponse.json(loginEmailUser(user?.email ?? "nagireddy.mudusu@gmail.com", ""));
      }

      if (method === "POST" && joined === "/auth/refresh") {
        const body = (await req.json()) as { refreshToken?: string };
        return NextResponse.json(refreshUserSession(body.refreshToken ?? ""));
      }

      if (method === "GET" && joined === "/admin/team") {
        requireUser(authHeader);
        return NextResponse.json(getAdminTeam());
      }

      if (method === "GET" && joined === "/admin/users") {
        requireUser(authHeader);
        return NextResponse.json(listAdminUsers());
      }

      if (method === "PATCH" && path[0] === "admin" && path[1] === "users" && path[2] && path[3] === "roles") {
        requireUser(authHeader);
        const userId = decodeURIComponent(path[2]);
        const body = (await req.json()) as { role?: string; enabled?: boolean };
        return NextResponse.json(setAdminUserRole(userId, body.role ?? "", Boolean(body.enabled)));
      }

      if (method === "POST" && joined === "/admin/team/invites") {
        requireUser(authHeader);
        const body = (await req.json()) as { email?: string };
        const id = `inv_${Date.now()}`;
        state.teamInvites.set(id, {
          id,
          email: body.email?.trim() || "invitee@veggoeats.in",
          expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
        });
        return new NextResponse(null, { status: 204 });
      }

      if (method === "DELETE" && path[0] === "admin" && path[1] === "team" && path[2] === "invites" && path[3]) {
        requireUser(authHeader);
        state.teamInvites.delete(decodeURIComponent(path[3]));
        return new NextResponse(null, { status: 204 });
      }

      if (method === "DELETE" && path[0] === "admin" && path[1] === "team" && path[2] === "members" && path[3]) {
        requireUser(authHeader);
        const u = state.users.get(decodeURIComponent(path[3]));
        if (u && !u.mainAdmin) {
          u.roles = u.roles.filter((r) => r !== "ADMIN");
        }
        return new NextResponse(null, { status: 204 });
      }

      if (method === "POST" && joined === "/admin/restaurant-owners") {
        requireUser(authHeader);
        const body = (await req.json()) as { email?: string };
        const cleanEmail = (body.email ?? "").trim().toLowerCase();
        let u = [...state.users.values()].find((x) => x.email?.toLowerCase() === cleanEmail);
        if (!u) {
          u = {
            id: `usr_${Date.now()}`,
            name: cleanEmail.split("@")[0] || "Owner",
            phone: null,
            email: cleanEmail,
            emailVerified: true,
            roles: ["CUSTOMER", "RESTAURANT"],
          };
          state.users.set(u.id, u);
        } else if (!u.roles.includes("RESTAURANT")) {
          u.roles.push("RESTAURANT");
        }
        return NextResponse.json({ userId: u.id });
      }

      if (method === "GET" && joined === "/me") {
        const user = requireUser(authHeader);
        return NextResponse.json(toMe(user));
      }

      if (method === "PATCH" && joined === "/me") {
        const user = requireUser(authHeader);
        const body = (await req.json()) as { name?: string };
        const trimmed = (body.name ?? "").trim();
        if (!trimmed || trimmed.length > 80) {
          throw new HttpProblem(400, "Bad Request", "Enter a valid display name (1 to 80 characters)");
        }
        user.name = trimmed;
        return NextResponse.json(toMe(user));
      }

      if (method === "DELETE" && joined === "/me") {
        const user = requireUser(authHeader);
        state.users.delete(user.id);
        return new NextResponse(null, { status: 204 });
      }

      if (method === "POST" && joined === "/me/credentials") {
        const user = requireUser(authHeader);
        const body = (await req.json()) as { email?: string; password?: string };
        user.email = body.email?.trim() ?? user.email;
        user.password = body.password ?? user.password;
        user.emailVerified = true;
        return new NextResponse(null, { status: 204 });
      }

      if (method === "POST" && joined === "/me/phone/request") {
        requireUser(authHeader);
        return new NextResponse(null, { status: 204 });
      }

      if (method === "POST" && joined === "/me/phone/verify") {
        const user = requireUser(authHeader);
        const body = (await req.json()) as { phone?: string };
        user.phone = body.phone ?? user.phone;
        return new NextResponse(null, { status: 204 });
      }

      if (method === "POST" && joined === "/me/partner") {
        const user = requireUser(authHeader);
        if (!user.roles.includes("PARTNER")) user.roles.push("PARTNER");
        return new NextResponse(null, { status: 204 });
      }

      if (method === "POST" && joined === "/me/consents") {
        const user = requireUser(authHeader);
        const body = (await req.json()) as { purpose?: string; version?: string; granted?: boolean };
        if (!body.purpose || !body.version || typeof body.granted !== "boolean") {
          throw new HttpProblem(400, "Bad Request", "Consent purpose, version, and granted flag are required");
        }
        user.consents = user.consents ?? {};
        user.consents[body.purpose] = {
          version: body.version,
          granted: body.granted,
          updatedAt: new Date().toISOString(),
        };
        return new NextResponse(null, { status: 204 });
      }

      if (method === "GET" && joined === "/me/preferences") {
        const user = requireUser(authHeader);
        return NextResponse.json(user.preferences ?? {});
      }

      if (method === "PUT" && joined === "/me/preferences") {
        const user = requireUser(authHeader);
        const body = (await req.json()) as Record<string, unknown>;
        user.preferences = body ?? {};
        return new NextResponse(null, { status: 204 });
      }
    }

    // ---------- CATALOG SERVICE ----------
    if (service === "catalog") {
      if (method === "GET" && joined === "/restaurants") {
        const sp = req.nextUrl.searchParams;
        const lat = sp.get("lat") ? Number(sp.get("lat")) : undefined;
        const lng = sp.get("lng") ? Number(sp.get("lng")) : undefined;
        const radiusMeters = sp.get("radiusMeters") ? Number(sp.get("radiusMeters")) : undefined;
        const diet = (sp.get("diet") as Diet | null) || null;
        const q = sp.get("q");
        const includeClosed = sp.get("includeClosed") === "true";
        return NextResponse.json(searchRestaurants({ lat, lng, radiusMeters, diet, q, includeClosed }), {
          headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=60" },
        });
      }

      if (method === "POST" && joined === "/restaurants") {
        requireUser(authHeader);
        const body = (await req.json()) as {
          name?: string;
          fssaiNumber?: string;
          kitchenCertificationLevel?: string;
          lat?: number;
          lng?: number;
          deliveryRadiusMeters?: number;
          open?: boolean;
          cuisine?: string;
          ownerUserId?: string;
        };
        return NextResponse.json(createRestaurant(body), { status: 201 });
      }

      if (method === "GET" && path[0] === "restaurants" && path.length === 2) {
        return NextResponse.json(getRestaurantById(decodeURIComponent(path[1])));
      }

      if (method === "PUT" && path[0] === "restaurants" && path.length === 2) {
        requireUser(authHeader);
        const id = decodeURIComponent(path[1]);
        const r = state.restaurants.find((x) => x.id === id);
        if (!r) throw new HttpProblem(404, "Restaurant not found");
        const body = (await req.json()) as { ownerUserId?: string; open?: boolean; deliveryRadiusMeters?: number };
        if (body.ownerUserId) r.ownerUserId = body.ownerUserId;
        if (typeof body.open === "boolean") r.open = body.open;
        if (typeof body.deliveryRadiusMeters === "number" && body.deliveryRadiusMeters >= 500) {
          r.deliveryRadiusMeters = Math.round(body.deliveryRadiusMeters);
        }
        return NextResponse.json(getRestaurantById(id));
      }

      if (method === "PATCH" && path[0] === "restaurants" && path.length === 3 && path[2] === "status") {
        requireUser(authHeader);
        const id = decodeURIComponent(path[1]);
        const body = (await req.json()) as { open?: boolean; deliveryRadiusMeters?: number };
        return NextResponse.json(setRestaurantStatus(id, Boolean(body.open), body.deliveryRadiusMeters));
      }

      if (method === "GET" && path[0] === "restaurants" && path.length === 3 && path[2] === "menu") {
        const diet = (req.nextUrl.searchParams.get("diet") as Diet | null) || null;
        return NextResponse.json(getRestaurantMenu(decodeURIComponent(path[1]), diet));
      }

      if (method === "POST" && path[0] === "restaurants" && path.length === 3 && path[2] === "items") {
        requireUser(authHeader);
        const body = (await req.json()) as MenuItemPayload;
        const created = upsertMenuItem(decodeURIComponent(path[1]), null, body);
        return NextResponse.json(created, { status: 201 });
      }

      if (method === "PUT" && path[0] === "items" && path.length === 2) {
        requireUser(authHeader);
        const body = (await req.json()) as MenuItemPayload;
        return NextResponse.json(upsertMenuItem(null, decodeURIComponent(path[1]), body));
      }

      if (method === "PATCH" && path[0] === "items" && path.length === 2 && path[1] === "availability") {
        requireUser(authHeader);
        const body = (await req.json()) as { itemIds?: string[]; available?: boolean };
        return NextResponse.json(setBulkMenuItemAvailability(body.itemIds ?? [], Boolean(body.available)));
      }

      if (method === "PATCH" && path[0] === "items" && path.length === 2 && path[1] === "price") {
        requireUser(authHeader);
        const body = (await req.json()) as { updates?: { itemId: string; pricePaise: number }[] };
        return NextResponse.json(setBulkMenuItemPrices(body.updates ?? []));
      }

      if (method === "PATCH" && path[0] === "items" && path.length === 3 && path[2] === "availability") {
        requireUser(authHeader);
        const body = (await req.json()) as { available?: boolean };
        return NextResponse.json(setMenuItemAvailability(decodeURIComponent(path[1]), Boolean(body.available)));
      }
    }

    // ---------- DEAD LETTERS (across services) ----------
    if (joined.endsWith("/dead-letters") && method === "GET") {
      requireUser(authHeader);
      const list = state.deadLetters[service as DeadLetterService] ?? [];
      return NextResponse.json({ open: list.length, items: list });
    }
    if ((joined.endsWith("/retry") || joined.endsWith("/discard")) && method === "POST" && joined.includes("dead-letters")) {
      requireUser(authHeader);
      const id = Number(path[path.length - 2]);
      const list = state.deadLetters[service as DeadLetterService] ?? [];
      state.deadLetters[service as DeadLetterService] = list.filter((x) => x.id !== id);
      return new NextResponse(null, { status: 204 });
    }

    // ---------- NOTIFICATIONS SERVICE ----------
    if (service === "notifications") {
      if (method === "GET" && joined === "/notifications") {
        const user = requireUser(authHeader);
        const limit = Number(req.nextUrl.searchParams.get("limit") || 20);
        return NextResponse.json(getUserInbox(user.id, limit));
      }

      if (method === "GET" && joined === "/notifications/unread-count") {
        const user = requireUser(authHeader);
        return NextResponse.json({ unread: getUserInbox(user.id).unread });
      }

      if (method === "POST" && joined === "/notifications/read-all") {
        const user = requireUser(authHeader);
        const list = state.notifications.get(user.id) ?? [];
        for (const n of list) n.read = true;
        return new NextResponse(null, { status: 204 });
      }

      if (method === "POST" && path[0] === "notifications" && path[2] === "read") {
        const user = requireUser(authHeader);
        const id = decodeURIComponent(path[1]);
        const list = state.notifications.get(user.id) ?? [];
        const item = list.find((n) => n.id === id);
        if (item) item.read = true;
        return new NextResponse(null, { status: 204 });
      }
    }

    // ---------- ORDERS SERVICE ----------
    if (service === "orders") {
      if (method === "POST" && joined === "/orders") {
        const user = requireUser(authHeader);
        const body = (await req.json()) as {
          restaurantId?: string;
          lines?: { itemId: string; quantity: number }[];
          deliveryAddress?: string;
          cookingInstructions?: string;
        };
        const idempotencyKey = req.headers.get("idempotency-key");
        const created = createOrderForUser(user.id, body.restaurantId ?? "", body.lines ?? [], idempotencyKey, {
          deliveryAddress: body.deliveryAddress,
          cookingInstructions: body.cookingInstructions,
        });
        return NextResponse.json(created, { status: 201 });
      }

      if (method === "GET" && joined === "/orders") {
        const user = requireUser(authHeader);
        const list = [...state.orders.values()].filter((o) => o.userId === user.id);
        return NextResponse.json(list);
      }

      if (method === "GET" && joined === "/orders/restaurant") {
        requireUser(authHeader);
        const history = req.nextUrl.searchParams.get("history") === "true";
        return NextResponse.json(listStaffOrders(history));
      }

      if (method === "GET" && joined === "/orders/restaurant/stream") {
        requireUser(authHeader);
        return sseResponse(["event: changed\ndata: {}\n\n"]);
      }

      if (method === "GET" && path[0] === "orders" && path[1] === "track" && path[2]) {
        return NextResponse.json(trackOrderByNumber(decodeURIComponent(path[2])));
      }

      if (method === "GET" && path[0] === "orders" && path.length === 2) {
        requireUser(authHeader);
        const id = decodeURIComponent(path[1]);
        const order = state.orders.get(id);
        if (!order) throw new HttpProblem(404, "Order not found");
        return NextResponse.json(order);
      }

      if (method === "GET" && path[0] === "orders" && path.length === 3 && path[2] === "stream") {
        requireUser(authHeader);
        const id = decodeURIComponent(path[1]);
        const order = state.orders.get(id);
        if (!order) throw new HttpProblem(404, "Order not found");
        return sseResponse([`event: status\ndata: ${JSON.stringify({ status: order.status })}\n\n`]);
      }

      if (method === "POST" && path[0] === "orders" && path.length === 3 && path[2] === "cancel") {
        requireUser(authHeader);
        const id = decodeURIComponent(path[1]);
        let reason: string | undefined;
        try {
          const text = await req.text();
          if (text) {
            const parsed = JSON.parse(text) as { reason?: string };
            reason = parsed.reason;
          }
        } catch {
          /* optional body */
        }
        return NextResponse.json(cancelOrderByCustomer(id, reason));
      }

      if (
        method === "POST" &&
        path[0] === "orders" &&
        path.length === 3 &&
        (path[2] === "accept" || path[2] === "reject" || path[2] === "preparing")
      ) {
        requireUser(authHeader);
        const id = decodeURIComponent(path[1]);
        return NextResponse.json(transitionOrderByStaff(id, path[2]));
      }

      if (method === "POST" && path[0] === "orders" && path.length === 4 && path[2] === "rider" && path[3] === "picked-up") {
        requireUser(authHeader);
        const id = decodeURIComponent(path[1]);
        const order = state.orders.get(id);
        if (!order) throw new HttpProblem(404, "Order not found");
        const now = new Date().toISOString();
        order.status = "PICKED_UP";
        order.updatedAt = now;
        order.timeline.push({ status: "PICKED_UP", at: now });
        const del = state.deliveries.get(id);
        if (del) {
          del.status = "PICKED_UP";
          del.updatedAt = now;
        }
        return NextResponse.json({ id: order.id, orderNumber: order.orderNumber, status: order.status });
      }

      if (method === "POST" && path[0] === "orders" && path.length === 4 && path[2] === "rider" && path[3] === "deliver") {
        requireUser(authHeader);
        const id = decodeURIComponent(path[1]);
        const order = state.orders.get(id);
        if (!order) throw new HttpProblem(404, "Order not found");
        const body = (await req.json()) as { otp?: string };
        if (body.otp && body.otp !== order.deliveryOtp) {
          throw new HttpProblem(400, "Invalid delivery OTP", "Check the 4-digit OTP with the customer.");
        }
        const now = new Date().toISOString();
        order.status = "DELIVERED";
        order.updatedAt = now;
        order.timeline.push({ status: "DELIVERED", at: now });
        const del = state.deliveries.get(id);
        if (del) {
          del.status = "DELIVERED";
          del.updatedAt = now;
          if (del.partnerId) {
            const p = state.partners.get(del.partnerId);
            if (p && p.activeDeliveries > 0) p.activeDeliveries -= 1;
          }
        }
        return NextResponse.json({ id: order.id, orderNumber: order.orderNumber, status: order.status });
      }
    }

    // ---------- PAYMENTS SERVICE ----------
    if (service === "payments") {
      if (method === "POST" && joined === "/payments") {
        const user = requireUser(authHeader);
        const body = (await req.json()) as { orderId?: string; amountPaise?: number };
        const idempotencyKey = req.headers.get("idempotency-key");
        const payment = createPaymentForOrder(user.id, body.orderId ?? "", Number(body.amountPaise ?? 0), idempotencyKey);
        return NextResponse.json(payment, { status: 201 });
      }

      if (method === "GET" && path[0] === "payments" && path.length === 2) {
        requireUser(authHeader);
        return NextResponse.json(getPaymentById(decodeURIComponent(path[1])));
      }

      if (method === "POST" && path[0] === "payments" && path.length === 3 && path[2] === "refund") {
        requireUser(authHeader);
        const body = (await req.json()) as { amountPaise?: number };
        const refunded = refundPaymentById(decodeURIComponent(path[1]), Number(body.amountPaise ?? 0));
        return NextResponse.json(refunded, { status: 201 });
      }
    }

    // ---------- FLEET SERVICE ----------
    if (service === "fleet") {
      if (method === "GET" && (joined === "/fleet/stream" || joined === "/fleet/admin/stream")) {
        requireUser(authHeader);
        return sseResponse(["event: changed\ndata: {}\n\n"]);
      }

      if (method === "GET" && joined === "/fleet/me") {
        const user = requireUser(authHeader);
        const partner = state.partners.get(user.id);
        if (!partner) throw new HttpProblem(404, "Partner profile not found");
        return NextResponse.json(partner);
      }

      if (method === "POST" && joined === "/fleet/partners/me") {
        const user = requireUser(authHeader);
        const body = (await req.json()) as { name?: string; vehicle?: string };
        const partner = {
          userId: user.id,
          name: body.name?.trim() || user.name || "Partner",
          vehicle: body.vehicle?.trim() || "Bike",
          online: true,
          activeDeliveries: 0,
        };
        state.partners.set(user.id, partner);
        return NextResponse.json(partner, { status: 201 });
      }

      if (method === "PUT" && joined === "/fleet/me/online") {
        const user = requireUser(authHeader);
        const partner = state.partners.get(user.id);
        if (!partner) throw new HttpProblem(404, "Partner profile not found");
        const body = (await req.json()) as { online?: boolean };
        partner.online = Boolean(body.online);
        return NextResponse.json(partner);
      }

      if (method === "GET" && joined === "/fleet/pool") {
        requireUser(authHeader);
        return NextResponse.json([...state.deliveries.values()].filter((d) => d.status === "AVAILABLE"));
      }

      if (method === "GET" && joined === "/fleet/me/deliveries") {
        const user = requireUser(authHeader);
        const history = req.nextUrl.searchParams.get("history") === "true";
        const activeSet = new Set(["ASSIGNED", "PICKED_UP"]);
        return NextResponse.json(
          [...state.deliveries.values()]
            .filter(
              (d) =>
                d.partnerId === user.id &&
                (history ? !activeSet.has(d.status) : activeSet.has(d.status)),
            )
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        );
      }

      if (method === "POST" && path[0] === "fleet" && path[1] === "deliveries" && path[3] === "accept") {
        const user = requireUser(authHeader);
        const orderId = decodeURIComponent(path[2]);
        const del = state.deliveries.get(orderId);
        if (!del) throw new HttpProblem(404, "Delivery not found");
        del.status = "ASSIGNED";
        del.partnerId = user.id;
        del.updatedAt = new Date().toISOString();
        const partner = state.partners.get(user.id);
        if (partner) partner.activeDeliveries += 1;
        const order = state.orders.get(orderId);
        if (order) {
          order.status = "RIDER_ASSIGNED";
          order.updatedAt = del.updatedAt;
          order.timeline.push({ status: "RIDER_ASSIGNED", at: del.updatedAt });
        }
        return NextResponse.json(del);
      }

      if (method === "GET" && joined === "/fleet/admin/deliveries") {
        requireUser(authHeader);
        return NextResponse.json([...state.deliveries.values()]);
      }

      if (method === "GET" && joined === "/fleet/admin/partners") {
        requireUser(authHeader);
        return NextResponse.json([...state.partners.values()]);
      }

      if (method === "POST" && path[0] === "fleet" && path[1] === "admin" && path[2] === "deliveries" && path[4] === "assign") {
        requireUser(authHeader);
        const orderId = decodeURIComponent(path[3]);
        const body = (await req.json()) as { partnerId?: string };
        const del = state.deliveries.get(orderId);
        if (!del) throw new HttpProblem(404, "Delivery not found");
        del.status = "ASSIGNED";
        del.partnerId = body.partnerId ?? null;
        del.updatedAt = new Date().toISOString();
        if (del.partnerId) {
          const partner = state.partners.get(del.partnerId);
          if (partner) partner.activeDeliveries += 1;
        }
        const order = state.orders.get(orderId);
        if (order) {
          order.status = "RIDER_ASSIGNED";
          order.updatedAt = del.updatedAt;
          order.timeline.push({ status: "RIDER_ASSIGNED", at: del.updatedAt });
        }
        return NextResponse.json(del);
      }
    }

    throw new HttpProblem(404, "Not Found", `No handler for ${method} /api/${service}${joined}`);
  } catch (err) {
    return problemResponse(err);
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
