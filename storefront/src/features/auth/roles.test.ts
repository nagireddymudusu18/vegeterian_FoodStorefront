import { describe, expect, it } from "vitest";
import { rolesFromAccessToken, safeAdminNext } from "./roles";

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
