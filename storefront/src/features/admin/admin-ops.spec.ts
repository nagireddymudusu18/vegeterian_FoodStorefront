import test from "node:test";
import assert from "node:assert/strict";
import type { AdminUser } from "@/lib/api";
import { canToggleUserRole, computePlatformOpsSummary, filterAdminUsers } from "./admin-ops";

const USERS: AdminUser[] = [
  {
    id: "u1",
    name: "Nagireddy Mudusu",
    email: "nagireddy.mudusu@gmail.com",
    phone: "+91*****00001",
    roles: ["CUSTOMER", "ADMIN", "SUPER_ADMIN", "RESTAURANT", "PARTNER"],
    main: true,
  },
  {
    id: "u2",
    name: "Aarav Sharma",
    email: "aarav.kitchen@veggoeats.in",
    phone: "+91*****00002",
    roles: ["CUSTOMER", "RESTAURANT"],
    main: false,
  },
  {
    id: "u3",
    name: "Rohan Mehta",
    email: "rohan.mehta@example.com",
    phone: "+91*****00004",
    roles: ["CUSTOMER"],
    main: false,
  },
];

test("computePlatformOpsSummary aggregates live orders, GMV, kitchens, and fleet metrics", () => {
  const summary = computePlatformOpsSummary({
    restaurants: [
      { id: "r1", name: "Saffron", open: true, ownerUserId: "u1" },
      { id: "r2", name: "Green Leaf", open: false, ownerUserId: null },
    ],
    activeOrders: [
      {
        id: "o1",
        orderNumber: "FA-1",
        restaurantName: "Saffron",
        status: "PAID",
        totalPaise: 44790,
        items: [],
        createdAt: "2026-03-01T10:00:00Z",
        updatedAt: "2026-03-01T10:00:00Z",
      },
    ],
    historyOrders: [
      {
        id: "o2",
        orderNumber: "FA-2",
        restaurantName: "Saffron",
        status: "DELIVERED",
        totalPaise: 34290,
        items: [],
        createdAt: "2026-03-01T09:00:00Z",
        updatedAt: "2026-03-01T09:30:00Z",
      },
    ],
    deliveries: [
      {
        orderId: "o1",
        orderNumber: "FA-1",
        status: "AVAILABLE",
        createdAt: "2026-03-01T10:00:00Z",
        updatedAt: "2026-03-01T10:00:00Z",
      },
    ],
    partners: [{ userId: "u1", name: "Rider 1", vehicle: "EV", online: true, activeDeliveries: 0 }],
    parkedDeadLetters: 0,
    flags: [{ key: "otp_login", enabled: true, description: "OTP", updatedAt: "2026-01-01T00:00:00Z" }],
  });

  assert.equal(summary.liveOrdersCount, 1);
  assert.equal(summary.deliveredOrdersCount, 1);
  assert.equal(summary.grossMerchandiseValuePaise, 79080);
  assert.equal(summary.openKitchensCount, 1);
  assert.equal(summary.totalKitchensCount, 2);
  assert.equal(summary.unlinkedKitchensCount, 1);
  assert.equal(summary.onlineRidersCount, 1);
  assert.equal(summary.unassignedDeliveriesCount, 1);
});

test("filterAdminUsers filters by role and search query", () => {
  assert.equal(filterAdminUsers(USERS, "ALL", "").length, 3);
  assert.equal(filterAdminUsers(USERS, "RESTAURANT", "").length, 2);
  assert.equal(filterAdminUsers(USERS, "ALL", "aarav").length, 1);
  assert.equal(filterAdminUsers(USERS, "CUSTOMER", "rohan").length, 1);
});

test("canToggleUserRole enforces RBAC guardrails for ADMIN, RESTAURANT, and PARTNER", () => {
  assert.equal(canToggleUserRole(["ADMIN"], USERS[2], "RESTAURANT").allowed, true);
  assert.equal(canToggleUserRole(["ADMIN"], USERS[2], "PARTNER").allowed, true);
  assert.equal(canToggleUserRole(["ADMIN"], USERS[2], "ADMIN").allowed, false);
  assert.equal(canToggleUserRole(["ADMIN", "SUPER_ADMIN"], USERS[2], "ADMIN").allowed, true);
  assert.equal(canToggleUserRole(["ADMIN", "SUPER_ADMIN"], USERS[0], "ADMIN").allowed, false);
});
