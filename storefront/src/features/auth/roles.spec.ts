import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  portalLoginPath,
  resolvePortalScope,
  rolesFromAccessToken,
  safeAdminNext,
  safePartnerNext,
  safeRestaurantNext,
} from "./roles";

describe("Portal RBAC and scope resolution (node:test)", () => {
  it("resolves portal scope from URL pathname", () => {
    assert.equal(resolvePortalScope("/"), "customer");
    assert.equal(resolvePortalScope("/orders/123"), "customer");
    assert.equal(resolvePortalScope("/restaurants/11111111-1111-1111-1111-111111111111"), "customer");
    assert.equal(resolvePortalScope("/admin"), "admin");
    assert.equal(resolvePortalScope("/admin/restaurants"), "admin");
    assert.equal(resolvePortalScope("/restaurant"), "restaurant");
    assert.equal(resolvePortalScope("/restaurant/menu"), "restaurant");
    assert.equal(resolvePortalScope("/partner"), "partner");
    assert.equal(resolvePortalScope("/partner/login"), "partner");
  });

  it("maps each portal scope to its dedicated login screen", () => {
    assert.equal(portalLoginPath("customer"), "/login");
    assert.equal(portalLoginPath("admin"), "/admin/login");
    assert.equal(portalLoginPath("restaurant"), "/restaurant/login");
    assert.equal(portalLoginPath("partner"), "/partner/login");
  });

  it("enforces same-portal post-login redirects", () => {
    assert.equal(safeAdminNext("/admin/restaurants"), "/admin/restaurants");
    assert.equal(safeAdminNext("/restaurant/menu"), "/admin");
    assert.equal(safeRestaurantNext("/restaurant/menu"), "/restaurant/menu");
    assert.equal(safeRestaurantNext("/restaurant/login"), "/restaurant");
    assert.equal(safeRestaurantNext("/partner"), "/restaurant");
    assert.equal(safePartnerNext("/partner?tab=pool"), "/partner?tab=pool");
    assert.equal(safePartnerNext("/partner/login"), "/partner");
    assert.equal(safePartnerNext("/admin"), "/partner");
  });

  it("extracts JWT roles claim safely", () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const tok = `${b64({ alg: "RS256" })}.${b64({ roles: ["RESTAURANT", "PARTNER"] })}.sig`;
    assert.deepEqual(rolesFromAccessToken(tok), ["RESTAURANT", "PARTNER"]);
  });
});
