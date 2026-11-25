import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluatePortalMiddleware,
  readPreviewLockCookie,
  resolveExternalPortalUrls,
  resolveLockedPortal,
  resolvePortalFromHost,
} from "./portal-isolation";
import { resolvePortalScope } from "../features/auth/roles";

describe("Four-storefront portal isolation (node:test)", () => {
  it("isolates production subdomains and env locks with strict precedence", () => {
    assert.equal(resolvePortalFromHost("restaurant.veggoeats.in"), "restaurant");
    assert.equal(resolvePortalFromHost("partner.veggoeats.in"), "partner");
    assert.equal(resolvePortalFromHost("admin.veggoeats.in"), "admin");
    assert.equal(resolvePortalFromHost("veggoeats.in", "veggoeats.in"), "customer");
    assert.equal(resolvePortalFromHost("localhost:3000"), null);

    // Env lock overrides subdomain and preview cookie
    const envWin = resolveLockedPortal({
      envPortal: "partner",
      host: "admin.veggoeats.in",
      previewLockCookie: "customer",
    });
    assert.deepEqual(envWin, { lockedPortal: "partner", source: "env" });

    // Host lock overrides preview cookie
    const hostWin = resolveLockedPortal({
      envPortal: "all",
      host: "restaurant.veggoeats.in",
      previewLockCookie: "admin",
    });
    assert.deepEqual(hostWin, { lockedPortal: "restaurant", source: "host" });
  });

  it("blocks cross-portal navigation with 404 and rewrites subdomain root routes", () => {
    // Customer storefront blocks /restaurant, /partner, /admin but allows /restaurants/:id
    assert.equal(
      evaluatePortalMiddleware({ pathname: "/restaurants/rest-saffron-1", lockedPortal: "customer" }).action,
      "allow",
    );
    assert.equal(
      evaluatePortalMiddleware({ pathname: "/restaurant", lockedPortal: "customer" }).action,
      "block_404",
    );
    assert.equal(
      evaluatePortalMiddleware({ pathname: "/partner", lockedPortal: "customer" }).action,
      "block_404",
    );
    assert.equal(
      evaluatePortalMiddleware({ pathname: "/admin", lockedPortal: "customer" }).action,
      "block_404",
    );

    // Restaurant storefront rewrites / and /menu and blocks /cart and /admin
    assert.deepEqual(evaluatePortalMiddleware({ pathname: "/", lockedPortal: "restaurant" }), {
      action: "rewrite",
      destination: "/restaurant",
      portal: "restaurant",
    });
    assert.deepEqual(evaluatePortalMiddleware({ pathname: "/menu", lockedPortal: "restaurant" }), {
      action: "rewrite",
      destination: "/restaurant/menu",
      portal: "restaurant",
    });
    assert.equal(
      evaluatePortalMiddleware({ pathname: "/cart", lockedPortal: "restaurant" }).action,
      "block_404",
    );

    // Delivery Partner and Admin portals rewrite / and /login cleanly
    assert.deepEqual(evaluatePortalMiddleware({ pathname: "/", lockedPortal: "partner" }), {
      action: "rewrite",
      destination: "/partner",
      portal: "partner",
    });
    assert.deepEqual(evaluatePortalMiddleware({ pathname: "/team", lockedPortal: "admin" }), {
      action: "rewrite",
      destination: "/admin/team",
      portal: "admin",
    });
  });

  it("binds resolvePortalScope to locked portal even on rewritten root paths", () => {
    assert.equal(
      resolvePortalScope("/", { hostname: "restaurant.veggoeats.in" }),
      "restaurant",
    );
    assert.equal(
      resolvePortalScope("/menu", { envPortal: "restaurant" }),
      "restaurant",
    );
    assert.equal(
      resolvePortalScope("/login", { hostname: "partner.veggoeats.in" }),
      "partner",
    );
    assert.equal(
      resolvePortalScope("/team", { hostname: "admin.veggoeats.in" }),
      "admin",
    );
  });

  it("parses preview lock cookie and rejects non-HTTP external portal URLs", () => {
    assert.equal(readPreviewLockCookie("veggo_preview_portal_lock=admin"), "admin");
    assert.deepEqual(
      resolveExternalPortalUrls({
        NEXT_PUBLIC_PARTNER_PORTAL_URL: "https://partner.veggoeats.in",
        NEXT_PUBLIC_ADMIN_PORTAL_URL: "data:text/html,bad",
      }),
      { partner: "https://partner.veggoeats.in" },
    );
  });
});
