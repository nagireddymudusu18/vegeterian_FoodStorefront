import { describe, expect, it } from "vitest";
import {
  evaluatePortalMiddleware,
  parsePortalEnv,
  readPreviewLockCookie,
  resolveExternalPortalUrls,
  resolveLockedPortal,
  resolvePortalFromHost,
} from "./portal-isolation";

describe("portal-isolation", () => {
  it("parses NEXT_PUBLIC_APP_PORTAL cleanly with safe fallback to all", () => {
    expect(parsePortalEnv(undefined)).toBe("all");
    expect(parsePortalEnv("")).toBe("all");
    expect(parsePortalEnv("all")).toBe("all");
    expect(parsePortalEnv("CUSTOMER")).toBe("customer");
    expect(parsePortalEnv("restaurant")).toBe("restaurant");
    expect(parsePortalEnv("partner")).toBe("partner");
    expect(parsePortalEnv("admin")).toBe("admin");
    expect(parsePortalEnv("unknown-value")).toBe("all");
  });

  it("resolves dedicated production subdomains and configured customer apex host", () => {
    expect(resolvePortalFromHost("restaurant.veggoeats.in")).toBe("restaurant");
    expect(resolvePortalFromHost("kitchen.veggoeats.in:443")).toBe("restaurant");
    expect(resolvePortalFromHost("partner.veggoeats.in")).toBe("partner");
    expect(resolvePortalFromHost("rider.veggoeats.in")).toBe("partner");
    expect(resolvePortalFromHost("admin.veggoeats.in")).toBe("admin");
    expect(resolvePortalFromHost("veggoeats.in", "veggoeats.in")).toBe("customer");
    expect(resolvePortalFromHost("www.veggoeats.in", "veggoeats.in")).toBe("customer");
    expect(resolvePortalFromHost("localhost:3000", "veggoeats.in")).toBeNull();
    expect(resolvePortalFromHost("ais-dev-example.us-east1.run.app")).toBeNull();
  });

  it("enforces lock precedence: env > host > preview cookie > none", () => {
    expect(
      resolveLockedPortal({
        envPortal: "restaurant",
        host: "admin.veggoeats.in",
        previewLockCookie: "partner",
      }),
    ).toEqual({ lockedPortal: "restaurant", source: "env" });

    expect(
      resolveLockedPortal({
        envPortal: "all",
        host: "admin.veggoeats.in",
        previewLockCookie: "partner",
      }),
    ).toEqual({ lockedPortal: "admin", source: "host" });

    expect(
      resolveLockedPortal({
        envPortal: "all",
        host: "localhost:3000",
        previewLockCookie: "partner",
      }),
    ).toEqual({ lockedPortal: "partner", source: "preview_lock" });

    expect(
      resolveLockedPortal({
        envPortal: "all",
        host: "localhost:3000",
        previewLockCookie: null,
      }),
    ).toEqual({ lockedPortal: null, source: "none" });
  });

  it("blocks cross-portal routes with 404 when locked to customer while keeping /restaurants/*", () => {
    expect(evaluatePortalMiddleware({ pathname: "/", lockedPortal: "customer" })).toEqual({
      action: "allow",
      portal: "customer",
    });
    expect(
      evaluatePortalMiddleware({ pathname: "/restaurants/rest-saffron-1", lockedPortal: "customer" }),
    ).toEqual({
      action: "allow",
      portal: "customer",
    });
    expect(evaluatePortalMiddleware({ pathname: "/restaurant", lockedPortal: "customer" })).toEqual({
      action: "block_404",
      portal: "customer",
    });
    expect(
      evaluatePortalMiddleware({ pathname: "/restaurant/menu", lockedPortal: "customer" }),
    ).toEqual({
      action: "block_404",
      portal: "customer",
    });
    expect(evaluatePortalMiddleware({ pathname: "/partner", lockedPortal: "customer" })).toEqual({
      action: "block_404",
      portal: "customer",
    });
    expect(evaluatePortalMiddleware({ pathname: "/admin/team", lockedPortal: "customer" })).toEqual({
      action: "block_404",
      portal: "customer",
    });
  });

  it("rewrites clean root URLs for locked restaurant, partner, and admin storefronts and blocks other portals", () => {
    // Restaurant portal
    expect(evaluatePortalMiddleware({ pathname: "/", lockedPortal: "restaurant" })).toEqual({
      action: "rewrite",
      destination: "/restaurant",
      portal: "restaurant",
    });
    expect(evaluatePortalMiddleware({ pathname: "/menu", lockedPortal: "restaurant" })).toEqual({
      action: "rewrite",
      destination: "/restaurant/menu",
      portal: "restaurant",
    });
    expect(evaluatePortalMiddleware({ pathname: "/login", lockedPortal: "restaurant" })).toEqual({
      action: "rewrite",
      destination: "/restaurant/login",
      portal: "restaurant",
    });
    expect(evaluatePortalMiddleware({ pathname: "/cart", lockedPortal: "restaurant" })).toEqual({
      action: "block_404",
      portal: "restaurant",
    });
    expect(evaluatePortalMiddleware({ pathname: "/admin", lockedPortal: "restaurant" })).toEqual({
      action: "block_404",
      portal: "restaurant",
    });

    // Delivery partner portal
    expect(evaluatePortalMiddleware({ pathname: "/", lockedPortal: "partner" })).toEqual({
      action: "rewrite",
      destination: "/partner",
      portal: "partner",
    });
    expect(evaluatePortalMiddleware({ pathname: "/login", lockedPortal: "partner" })).toEqual({
      action: "rewrite",
      destination: "/partner/login",
      portal: "partner",
    });
    expect(evaluatePortalMiddleware({ pathname: "/restaurant", lockedPortal: "partner" })).toEqual({
      action: "block_404",
      portal: "partner",
    });

    // Admin portal
    expect(evaluatePortalMiddleware({ pathname: "/", lockedPortal: "admin" })).toEqual({
      action: "rewrite",
      destination: "/admin",
      portal: "admin",
    });
    expect(evaluatePortalMiddleware({ pathname: "/team", lockedPortal: "admin" })).toEqual({
      action: "rewrite",
      destination: "/admin/team",
      portal: "admin",
    });
    expect(
      evaluatePortalMiddleware({ pathname: "/restaurants/rest-saffron-1", lockedPortal: "admin" }),
    ).toEqual({
      action: "block_404",
      portal: "admin",
    });
  });

  it("always allows API, static bypass paths, and shared legal routes on every portal", () => {
    expect(
      evaluatePortalMiddleware({ pathname: "/api/catalog/restaurants", lockedPortal: "admin" }),
    ).toEqual({
      action: "allow",
      portal: "admin",
    });
    expect(evaluatePortalMiddleware({ pathname: "/terms", lockedPortal: "restaurant" })).toEqual({
      action: "allow",
      portal: "restaurant",
    });
    expect(evaluatePortalMiddleware({ pathname: "/privacy", lockedPortal: "partner" })).toEqual({
      action: "allow",
      portal: "partner",
    });
  });

  it("sanitizes optional external portal URLs and parses preview lock cookie safely", () => {
    expect(
      resolveExternalPortalUrls({
        NEXT_PUBLIC_RESTAURANT_PORTAL_URL: "https://restaurant.veggoeats.in/",
        NEXT_PUBLIC_PARTNER_PORTAL_URL: "javascript:alert(1)",
      }),
    ).toEqual({
      restaurant: "https://restaurant.veggoeats.in",
    });

    expect(readPreviewLockCookie("foo=1; veggo_preview_portal_lock=restaurant; bar=2")).toBe(
      "restaurant",
    );
    expect(readPreviewLockCookie("veggo_preview_portal_lock=invalid")).toBeNull();
  });
});
