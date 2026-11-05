import { describe, expect, it } from "vitest";
import {
  portalLoginPath,
  resolvePortalScope,
  rolesFromAccessToken,
  safeAdminNext,
  safePartnerNext,
  safeRestaurantNext,
} from "./roles";

function token(claims: object): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "RS256" })}.${b64(claims)}.signature`;
}

describe("rolesFromAccessToken", () => {
  it("reads the roles claim", () => {
    expect(rolesFromAccessToken(token({ roles: ["CUSTOMER", "ADMIN", "SUPER_ADMIN"] }))).toEqual(["CUSTOMER", "ADMIN", "SUPER_ADMIN"]);
  });
  it("copes with url-safe characters and padding", () => {
    expect(rolesFromAccessToken(token({ sub: "??>>~~", roles: ["ADMIN"] }))).toEqual(["ADMIN"]);
  });
  it("returns nothing for missing or malformed tokens", () => {
    expect(rolesFromAccessToken(undefined)).toEqual([]);
    expect(rolesFromAccessToken("")).toEqual([]);
    expect(rolesFromAccessToken("abc")).toEqual([]);
    expect(rolesFromAccessToken("a.@@@.c")).toEqual([]);
    expect(rolesFromAccessToken(token({ roles: "ADMIN" }))).toEqual([]);
    expect(rolesFromAccessToken(token({ roles: ["ADMIN", 3, null] }))).toEqual(["ADMIN"]);
  });
});

describe("resolvePortalScope and portalLoginPath", () => {
  it("maps pathnames to the correct portal scope", () => {
    expect(resolvePortalScope("/")).toBe("customer");
    expect(resolvePortalScope("/orders/123")).toBe("customer");
    expect(resolvePortalScope("/admin")).toBe("admin");
    expect(resolvePortalScope("/admin/restaurants")).toBe("admin");
    expect(resolvePortalScope("/restaurant")).toBe("restaurant");
    expect(resolvePortalScope("/restaurant/menu")).toBe("restaurant");
    expect(resolvePortalScope("/partner")).toBe("partner");
    expect(resolvePortalScope("/partner/login")).toBe("partner");
  });

  it("returns the dedicated login path for each portal", () => {
    expect(portalLoginPath("customer")).toBe("/login");
    expect(portalLoginPath("admin")).toBe("/admin/login");
    expect(portalLoginPath("restaurant")).toBe("/restaurant/login");
    expect(portalLoginPath("partner")).toBe("/partner/login");
  });
});

describe("safeAdminNext", () => {
  it("keeps admin paths", () => {
    expect(safeAdminNext("/admin/flags")).toBe("/admin/flags");
    expect(safeAdminNext("/admin/team?x=1")).toBe("/admin/team?x=1");
  });
  it("falls back for anything else", () => {
    for (const bad of [null, undefined, "", "/", "/orders", "//evil.com", "https://evil.com/admin", "/admin/login", "/admin/accept?token=1"]) {
      expect(safeAdminNext(bad)).toBe("/admin");
    }
  });
});

describe("safeRestaurantNext and safePartnerNext", () => {
  it("keeps restaurant paths and rejects login or cross-portal paths", () => {
    expect(safeRestaurantNext("/restaurant")).toBe("/restaurant");
    expect(safeRestaurantNext("/restaurant/menu")).toBe("/restaurant/menu");
    for (const bad of [null, undefined, "", "/", "/admin", "/partner", "/restaurant/login", "//evil.com"]) {
      expect(safeRestaurantNext(bad)).toBe("/restaurant");
    }
  });

  it("keeps partner paths and rejects login or cross-portal paths", () => {
    expect(safePartnerNext("/partner")).toBe("/partner");
    expect(safePartnerNext("/partner?tab=pool")).toBe("/partner?tab=pool");
    for (const bad of [null, undefined, "", "/", "/admin", "/restaurant", "/partner/login", "//evil.com"]) {
      expect(safePartnerNext(bad)).toBe("/partner");
    }
  });
});

