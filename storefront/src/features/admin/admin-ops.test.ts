import { describe, expect, it } from "vitest";
import type { AdminUser } from "@/lib/api";
import { canToggleUserRole, computePlatformOpsSummary, filterAdminUsers } from "./admin-ops";

const USERS: AdminUser[] = [
  {
    id: "u1",
    name: "Nagireddy Mudusu",
    email: "nagireddy.mudusu@gmail.com",
    roles: ["CUSTOMER", "ADMIN", "SUPER_ADMIN"],
    main: true,
  },
  {
    id: "u2",
    name: "Rohan Mehta",
    email: "rohan.mehta@example.com",
    roles: ["CUSTOMER"],
    main: false,
  },
];

describe("admin-ops", () => {
  it("computes platform ops summary and filters users", () => {
    const s = computePlatformOpsSummary({
      restaurants: [{ id: "r1", name: "Saffron", open: true, ownerUserId: "u1" }],
      activeOrders: [],
      historyOrders: [],
      deliveries: [],
      partners: [],
      parkedDeadLetters: 0,
      flags: [],
    });
    expect(s.openKitchensCount).toBe(1);
    expect(filterAdminUsers(USERS, "ADMIN", "").length).toBe(1);
    expect(canToggleUserRole(["ADMIN"], USERS[1], "RESTAURANT").allowed).toBe(true);
    expect(canToggleUserRole(["ADMIN", "SUPER_ADMIN"], USERS[0], "ADMIN").allowed).toBe(false);
  });
});
