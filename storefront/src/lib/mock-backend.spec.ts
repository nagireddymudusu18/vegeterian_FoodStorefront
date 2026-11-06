import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  cancelOrderByCustomer,
  createOrderForUser,
  createPaymentForOrder,
  createRestaurant,
  getPaymentById,
  getRestaurantMenu,
  getUserInbox,
  listStaffOrders,
  normalizeOrderNumber,
  refundPaymentById,
  resetBackendState,
  searchRestaurants,
  setBulkMenuItemAvailability,
  setBulkMenuItemPrices,
  setMenuItemAvailability,
  trackOrderByNumber,
  upsertMenuItem,
  verifyOtpLogin,
} from "./mock-backend";
import { rolesFromAccessToken } from "../features/auth/roles";
import {
  countDeliverableKitchens,
  filterLocationPresets,
  latLngToMapPercent,
  mapPercentToLatLng,
  resolveNearestPreset,
  validateCoordinates,
} from "../features/catalog/locations";

test("searchRestaurants returns seeded Bengaluru restaurants and filters by diet and query", () => {
  resetBackendState();
  const all = searchRestaurants({ lat: 12.9716, lng: 77.5946 });
  assert.equal(all.length, 4);

  const jain = searchRestaurants({ lat: 12.9716, lng: 77.5946, diet: "JAIN" });
  assert.equal(jain.length, 2);

  const dosa = searchRestaurants({ lat: 12.9716, lng: 77.5946, q: "masala dosa" });
  assert.equal(dosa.length, 1);
  assert.equal(dosa[0].name, "Saffron Pure Veg Bhavan");
});

test("getRestaurantMenu filters items by diet", () => {
  resetBackendState();
  const allSpice = getRestaurantMenu("rest-spice-4", null);
  assert.equal(allSpice.length, 6);

  const vegSpice = getRestaurantMenu("rest-spice-4", "PURE_VEG");
  assert.equal(vegSpice.length, 2);
});

test("JWT roles, order pricing, payment capture, notifications, auto-refund, and tracking work end-to-end", () => {
  resetBackendState();
  const tokens = verifyOtpLogin("+919876543210", "123456", "Aarav");
  const roles = rolesFromAccessToken(tokens.accessToken);
  assert.ok(roles.includes("CUSTOMER"));

  const order = createOrderForUser(
    "usr_test",
    "rest-saffron-1",
    [{ itemId: "item-saffron-1", quantity: 2 }],
    "idem-key-1",
  );

  assert.equal(order.subtotalPaise, 49800);
  assert.equal(order.taxPaise, 2490);
  assert.equal(order.deliveryFeePaise, 3000);
  assert.equal(order.totalPaise, 55290);
  assert.equal(order.status, "CREATED");
  assert.ok(normalizeOrderNumber(order.orderNumber));

  const payment = createPaymentForOrder("usr_test", order.id, order.totalPaise, "pay-key-1");
  assert.equal(payment.status, "CAPTURED");

  const inbox = getUserInbox("usr_test");
  assert.equal(inbox.unread, 1);

  const tracked = trackOrderByNumber(order.orderNumber);
  assert.equal(tracked.status, "PAID");

  const cancelled = cancelOrderByCustomer(order.id);
  assert.equal(cancelled.status, "REFUNDED");
});

test("admin manual refund and kitchen menu item upsert + 86 availability enforce guardrails", () => {
  resetBackendState();
  const order = createOrderForUser("usr_refund", "rest-saffron-1", [{ itemId: "item-saffron-1", quantity: 1 }], "idem-r1");
  const payment = createPaymentForOrder("usr_refund", order.id, order.totalPaise, "pay-r1");

  // Lookup by orderNumber or paymentId
  const found = getPaymentById(order.orderNumber);
  assert.equal(found.id, payment.id);

  // Manual refund moves order to REFUNDED
  const ref = refundPaymentById(payment.id, 10000);
  assert.equal(ref.status, "SUCCEEDED");
  assert.equal(ref.amountPaise, 10000);
  assert.equal(trackOrderByNumber(order.orderNumber).status, "REFUNDED");

  // DietRules guardrail rejects vegan dish with ghee (422)
  assert.throws(
    () =>
      upsertMenuItem("rest-saffron-1", null, {
        name: "Ghee Roast",
        description: "Test",
        pricePaise: 15000,
        isPureVeg: true,
        isVegan: true,
        isJain: false,
        ingredients: ["ghee", "rice"],
        containsAllergens: ["milk"],
        available: true,
      }),
    /Diet rule violation/,
  );

  // Valid Jain dish succeeds and 86 toggle updates availability
  const created = upsertMenuItem("rest-saffron-1", null, {
    name: "Jain Jeera Rice",
    description: "Steamed basmati with cumin",
    pricePaise: 13900,
    isPureVeg: true,
    isVegan: true,
    isJain: true,
    ingredients: ["basmati rice", "cumin"],
    containsAllergens: [],
    available: true,
  });
  assert.equal(created.name, "Jain Jeera Rice");
  const toggled = setMenuItemAvailability(created.id, false);
  assert.equal(toggled.available, false);
});

test("interactive location presets, map projection, and Section 3 VM/Caddy edge guardrails are valid", () => {
  assert.equal(countDeliverableKitchens(12.9716, 77.5946).count, 4);
  assert.equal(countDeliverableKitchens(12.9698, 77.7499).count, 0);
  assert.equal(filterLocationPresets("560038")[0].id, "indiranagar");
  assert.equal(resolveNearestPreset(12.9716, 77.5946).suggestedLabel, "MG Road");

  const pct = latLngToMapPercent(12.9716, 77.5946);
  const back = mapPercentToLatLng(pct.xPercent, pct.yPercent);
  assert.ok(Math.abs(back.lat - 12.9716) < 0.002);
  assert.equal(validateCoordinates("95", "77").ok, false);

  const installSh = readFileSync(resolve(import.meta.dirname, "../../../deploy/gcp/vm/install.sh"), "utf8");
  assert.ok(installSh.includes("READY_FLAG=/run/veggo-ready"));
  assert.ok(installSh.includes("ConditionPathExists=/run/veggo-ready"));
  assert.ok(installSh.includes("/dev/tcp/127.0.0.1/5432"));

  const caddyfile = readFileSync(resolve(import.meta.dirname, "../../../deploy/gcp/vm/Caddyfile"), "utf8");
  assert.ok(caddyfile.includes("max_size 1MB"));
  assert.ok(caddyfile.includes("max_size 256KB"));
  assert.ok(caddyfile.includes("checkout.razorpay.com"));
});

test("customer profile preferences: allergen watchlist matching, saved addresses, and consents", async () => {
  const {
    matchItemAllergenWatchlist,
    toggleAllergenInList,
    upsertSavedAddress,
    removeSavedAddressById,
    sanitizeConsents,
  } = await import("../features/catalog/profile-prefs");

  const watchlist = toggleAllergenInList(["milk"], "onion_garlic");
  const hits = matchItemAllergenWatchlist(
    { containsAllergens: ["milk"], ingredients: ["paneer", "onion", "tomato"] },
    watchlist,
  );
  assert.deepEqual(hits, ["Milk & Dairy", "No Onion / Garlic"]);

  const saved = upsertSavedAddress([], {
    tag: "HOME",
    label: "Home",
    building: "Flat 302, Haldi Residency",
    landmark: "Opposite Metro Gate 2",
    areaLabel: "Indiranagar, Bengaluru",
    lat: 12.9784,
    lng: 77.6408,
  });
  assert.equal(saved.length, 1);
  assert.equal(removeSavedAddressById(saved, saved[0].id).length, 0);
  assert.equal(sanitizeConsents({ ORDER_SMS_UPDATES: false }).ORDER_SMS_UPDATES, false);
});

test("latency tuning, restaurant onboarding, and order deliveryAddress + cookingInstructions flow", () => {
  resetBackendState();
  const runServiceSh = readFileSync(resolve(import.meta.dirname, "../../../deploy/gcp/vm/run-service.sh"), "utf8");
  assert.ok(runServiceSh.includes("DB_POOL_MIN_IDLE=1"));
  assert.ok(runServiceSh.includes("DB_POOL_IDLE_MS=300000"));
  assert.ok(runServiceSh.includes("FEED_POLL_MS=1000"));

  // Admin restaurant onboarding with 14-digit FSSAI validation
  assert.throws(
    () =>
      createRestaurant({
        name: "Invalid FSSAI Kitchen",
        fssaiNumber: "12345",
        lat: 12.9716,
        lng: 77.5946,
      }),
    /14 digits/,
  );

  const onboarded = createRestaurant({
    name: "Anand Bhavan Pure Veg",
    fssaiNumber: "11224001000999",
    cuisine: "South Indian",
    kitchenCertificationLevel: "TIER_1_EXCLUSIVE_VEG",
    lat: 12.9716,
    lng: 77.5946,
    deliveryRadiusMeters: 5000,
    open: true,
  });
  assert.equal(onboarded.name, "Anand Bhavan Pure Veg");

  // Order with deliveryAddress and cookingInstructions flows to kitchen staff console
  const order = createOrderForUser(
    "usr_notes",
    "rest-saffron-1",
    [{ itemId: "item-saffron-1", quantity: 1 }],
    "idem-notes-1",
    {
      deliveryAddress: "Home: Flat 402, Haldi Residency, MG Road, Bengaluru",
      cookingInstructions: "Jain prep: no onion or garlic · Less spicy",
    },
  );
  assert.equal(order.deliveryAddress, "Home: Flat 402, Haldi Residency, MG Road, Bengaluru");
  assert.equal(order.cookingInstructions, "Jain prep: no onion or garlic · Less spicy");

  createPaymentForOrder("usr_notes", order.id, order.totalPaise, "pay-notes-1");
  const staffList = listStaffOrders(false);
  const staffTicket = staffList.find((s) => s.id === order.id);
  assert.equal(staffTicket?.cookingInstructions, "Jain prep: no onion or garlic · Less spicy");

  // Bulk menu item availability toggle
  const bulkDisabled = setBulkMenuItemAvailability(["item-saffron-1", "item-saffron-2"], false);
  assert.equal(bulkDisabled.length, 2);
  assert.equal(bulkDisabled[0].available, false);
  assert.equal(bulkDisabled[1].available, false);

  const bulkEnabled = setBulkMenuItemAvailability(["item-saffron-1", "item-saffron-2"], true);
  assert.equal(bulkEnabled[0].available, true);
  assert.equal(bulkEnabled[1].available, true);

  // Bulk menu item price update
  const bulkPriced = setBulkMenuItemPrices([
    { itemId: "item-saffron-1", pricePaise: 21500 },
    { itemId: "item-saffron-2", pricePaise: 18500 },
  ]);
  assert.equal(bulkPriced.length, 2);
  assert.equal(bulkPriced[0].pricePaise, 21500);
  assert.equal(bulkPriced[1].pricePaise, 18500);
});

test("setRestaurantStatus toggles store open/paused state and updates delivery radius", async () => {
  resetBackendState();
  const { setRestaurantStatus } = await import("./mock-backend");

  const paused = setRestaurantStatus("rest-saffron-1", false, 8000);
  assert.equal(paused.open, false);
  assert.equal(paused.deliveryRadiusMeters, 8000);

  // Customer search omits paused restaurant, while includeClosed returns it
  const publicOpen = searchRestaurants({ lat: 12.9716, lng: 77.5946 });
  assert.equal(publicOpen.some((r) => r.id === "rest-saffron-1"), false);

  const staffAll = searchRestaurants({ lat: 12.9716, lng: 77.5946, includeClosed: true });
  assert.equal(staffAll.some((r) => r.id === "rest-saffron-1"), true);

  const reopened = setRestaurantStatus("rest-saffron-1", true, 6000);
  assert.equal(reopened.open, true);
  assert.equal(reopened.deliveryRadiusMeters, 6000);
});

test("Phase 4: cancelOrderByCustomer records cancellationReason and setAdminUserRole toggles RBAC roles", async () => {
  resetBackendState();
  const { listAdminUsers, setAdminUserRole } = await import("./mock-backend");

  const cancelled = cancelOrderByCustomer("ord_seed_1", "Changed my mind");
  assert.equal(cancelled.status, "REFUNDED");
  assert.equal(cancelled.cancellationReason, "Changed my mind");
  assert.ok(cancelled.timeline.some((e) => e.status === "CANCELLED" && e.reason === "Changed my mind"));

  const users = listAdminUsers();
  assert.equal(users.length, 6);

  const rohan = users.find((u) => u.name === "Rohan Mehta");
  assert.ok(rohan);
  assert.equal(rohan.roles.includes("RESTAURANT"), false);

  const granted = setAdminUserRole(rohan.id, "RESTAURANT", true);
  assert.equal(granted.roles.includes("RESTAURANT"), true);

  const revoked = setAdminUserRole(rohan.id, "RESTAURANT", false);
  assert.equal(revoked.roles.includes("RESTAURANT"), false);

  const lockPath = resolve(import.meta.dirname, "../../../package-lock.json");
  const rootPkg = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../package.json"), "utf8")) as {
    workspaces?: string[];
  };
  assert.ok(Array.isArray(rootPkg.workspaces) && rootPkg.workspaces.includes("storefront"));
  try {
    const rootLock = JSON.parse(readFileSync(lockPath, "utf8")) as {
      lockfileVersion?: number;
      packages?: Record<string, unknown>;
    };
    assert.equal(rootLock.lockfileVersion, 3);
    assert.ok(rootLock.packages?.["storefront"]);
    assert.ok(rootLock.packages?.["node_modules/storefront"]);
  } catch {
    const bunLock = readFileSync(resolve(import.meta.dirname, "../../../bun.lock"), "utf8");
    assert.ok(bunLock.includes('"storefront"'));
  }
});

test("Phase 5: domain-isolated partner signup, org-managed customer groups, VIP free delivery, and dietary cohort guardrails", async () => {
  resetBackendState();
  const {
    listAdminUsers,
    registerEmailUser,
    requireUser,
    setAdminUserCustomerGroup,
    toMe,
    updateOrgCustomerGroupRules,
    verifyOtpLogin,
  } = await import("./mock-backend");

  // 1. Existing CUSTOMER (rohan.mehta@example.com / +919811100004) can sign up independently on RESTAURANT_OWNER
  // and DELIVERY_PARTNER domains without combining or mutating the CUSTOMER account.
  const restReg = registerEmailUser(
    "Rohan Kitchen Ventures",
    "rohan.mehta@example.com",
    "KitchenPass123",
    "RESTAURANT_OWNER",
  );
  const restMe = toMe(restReg.user);
  assert.equal(restMe.accountDomain, "RESTAURANT_OWNER");
  assert.deepEqual(restMe.roles, ["RESTAURANT"]);
  assert.equal(restMe.customerGroup, null);

  const partnerTokens = verifyOtpLogin("+919811100004", "123456", "Rohan Rider", "DELIVERY_PARTNER");
  const partnerMe = toMe(requireUser(`Bearer ${partnerTokens.accessToken}`));
  assert.equal(partnerMe.accountDomain, "DELIVERY_PARTNER");
  assert.deepEqual(partnerMe.roles, ["PARTNER"]);

  const allUsers = listAdminUsers();
  const customerRohan = allUsers.find((u) => u.id === "00000000-0000-0000-0000-000000000004");
  assert.ok(customerRohan);
  assert.equal(customerRohan.accountDomain, "CUSTOMER");
  assert.deepEqual(customerRohan.roles, ["CUSTOMER"]);
  assert.notEqual(restMe.id, customerRohan.id);
  assert.notEqual(partnerMe.id, customerRohan.id);

  // 2. VIP customer (00000000-0000-0000-0000-000000000001) gets 5% loyalty discount and ₹0 FREE delivery
  const vipOrder = createOrderForUser(
    "00000000-0000-0000-0000-000000000001",
    "rest-saffron-1",
    [{ itemId: "item-saffron-1", quantity: 2 }], // 49800 paise
    "idem-vip-1",
  );
  assert.equal(vipOrder.subtotalPaise, 49800);
  assert.equal(vipOrder.discountPercent, 5);
  assert.equal(vipOrder.discountPaise, 2490);
  assert.equal(vipOrder.deliveryFeePaise, 0);

  // 3. STRICT_JAIN cohort customer (00000000-0000-0000-0000-000000000005) is blocked from ordering non-Jain items or Tier-2 kitchens
  assert.throws(
    () =>
      createOrderForUser(
        "00000000-0000-0000-0000-000000000005",
        "rest-saffron-1",
        [{ itemId: "item-saffron-1", quantity: 1 }], // Paneer Butter Masala is not Jain
        "idem-jain-fail",
      ),
    /Cohort guardrail/,
  );

  // Valid Jain item from Tier-1 kitchen succeeds for STRICT_JAIN cohort
  const jainOrder = createOrderForUser(
    "00000000-0000-0000-0000-000000000005",
    "rest-jain-3",
    [{ itemId: "item-jain-1", quantity: 1 }], // Jain Pav Bhaji
    "idem-jain-ok",
  );
  assert.equal(jainOrder.status, "CREATED");

  // 4. Admin can pin a customer's group and update org customer group rules
  const updatedGroup = setAdminUserCustomerGroup("00000000-0000-0000-0000-000000000004", {
    loyaltyTier: "VIP",
    dietaryCohort: "VEGAN",
    assignmentMode: "ADMIN_PINNED",
  });
  assert.equal(updatedGroup.customerGroup?.loyaltyTier, "VIP");
  assert.equal(updatedGroup.customerGroup?.dietaryCohort, "VEGAN");
  assert.equal(updatedGroup.customerGroup?.assignmentMode, "ADMIN_PINNED");

  const updatedRules = updateOrgCustomerGroupRules({ vipDiscountPercent: 8 });
  assert.equal(updatedRules.vipDiscountPercent, 8);
});

test("Stateless JWT auth and orderSnapshot hydration survive serverless worker cold starts during payment submission", async () => {
  resetBackendState();
  const {
    refreshUserSession,
    requireUser,
  } = await import("./mock-backend");

  // 1. Customer logs in via OTP (or guest checkout OTP) and creates an order on Worker Instance A
  const tokens = verifyOtpLogin("+919845099887", "123456", "Priya Guest");
  const userA = requireUser(`Bearer ${tokens.accessToken}`);
  const order = createOrderForUser(
    userA.id,
    "rest-saffron-1",
    [{ itemId: "item-saffron-1", quantity: 1 }],
    "idem-serverless-1",
    {
      deliveryAddress: "Indiranagar 100ft Rd, Bengaluru",
      cookingInstructions: "Less spicy",
    },
  );
  assert.equal(order.status, "CREATED");

  // 2. Simulate Vercel / Cloud Run routing the subsequent POST /api/payments/payments request
  // to a completely fresh serverless worker instance (in-memory state reset)
  resetBackendState();

  // 3. requireUser must NOT throw 401 Unauthorized — it restores the user session from the signed JWT claims
  const userB = requireUser(`Bearer ${tokens.accessToken}`);
  assert.equal(userB.id, userA.id);
  assert.equal(userB.name, "Priya Guest");
  assert.equal(userB.phone, "+919845099887");

  // 4. createPaymentForOrder hydrates the order from orderSnapshot and marks it PAID without failing
  const payment = createPaymentForOrder(userB.id, order.id, order.totalPaise, "pay-serverless-1", {
    method: "UPI_VPA",
    methodLabel: "UPI (priya@okaxis)",
    upiVpa: "priya@okaxis",
    orderSnapshot: order,
  });
  assert.equal(payment.status, "CAPTURED");
  assert.equal(payment.order?.status, "PAID");
  assert.equal(payment.order?.paymentMethodLabel, "UPI (priya@okaxis)");

  const hydratedOrder = trackOrderByNumber(order.orderNumber);
  assert.equal(hydratedOrder.status, "PAID");
  assert.equal(hydratedOrder.orderNumber, order.orderNumber);

  // 5. Refresh token also works statelessly across cold worker instances
  resetBackendState();
  const refreshed = refreshUserSession(tokens.refreshToken);
  const userC = requireUser(`Bearer ${refreshed.accessToken}`);
  assert.equal(userC.id, userA.id);
});
