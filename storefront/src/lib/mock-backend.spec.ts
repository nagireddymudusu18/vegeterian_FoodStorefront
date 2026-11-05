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
  assert.ok(roles.includes("ADMIN"));

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
  assert.equal(users.length, 4);

  const rohan = users.find((u) => u.name === "Rohan Mehta");
  assert.ok(rohan);
  assert.equal(rohan.roles.includes("RESTAURANT"), false);

  const granted = setAdminUserRole(rohan.id, "RESTAURANT", true);
  assert.equal(granted.roles.includes("RESTAURANT"), true);

  const revoked = setAdminUserRole(rohan.id, "RESTAURANT", false);
  assert.equal(revoked.roles.includes("RESTAURANT"), false);
});


