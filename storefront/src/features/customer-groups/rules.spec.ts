import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canAccountAccessDomain,
  computeCustomerGroupOrderPricing,
  createDefaultCustomerGroupProfile,
  DEFAULT_ORG_CUSTOMER_GROUP_RULES,
  defaultRolesForAccountDomain,
  resolveAccountDomain,
  resolveEffectiveLoyaltyTier,
  sanitizeOrgCustomerGroupRules,
  validateOrderForDietaryCohort,
} from "./rules.ts";

describe("customer-groups & domain isolation rules", () => {
  it("resolves accountDomain from explicit flag, hostname, and pathname", () => {
    assert.equal(resolveAccountDomain({ explicitDomain: "RESTAURANT_OWNER" }), "RESTAURANT_OWNER");
    assert.equal(resolveAccountDomain({ hostname: "restaurant.veggoeats.in", pathname: "/" }), "RESTAURANT_OWNER");
    assert.equal(resolveAccountDomain({ hostname: "partner.veggoeats.in", pathname: "/" }), "DELIVERY_PARTNER");
    assert.equal(resolveAccountDomain({ hostname: "admin.veggoeats.in", pathname: "/" }), "ADMIN");
    assert.equal(resolveAccountDomain({ pathname: "/restaurant/login" }), "RESTAURANT_OWNER");
    assert.equal(resolveAccountDomain({ pathname: "/partner/deliveries" }), "DELIVERY_PARTNER");
    assert.equal(resolveAccountDomain({ pathname: "/admin/team" }), "ADMIN");
    assert.equal(resolveAccountDomain({ pathname: "/restaurants/rest-saffron-1" }), "CUSTOMER");
  });

  it("enforces strict domain access isolation and default roles per domain", () => {
    assert.deepEqual(defaultRolesForAccountDomain("CUSTOMER"), ["CUSTOMER"]);
    assert.deepEqual(defaultRolesForAccountDomain("RESTAURANT_OWNER"), ["RESTAURANT"]);
    assert.deepEqual(defaultRolesForAccountDomain("DELIVERY_PARTNER"), ["PARTNER"]);
    assert.deepEqual(defaultRolesForAccountDomain("ADMIN"), ["ADMIN"]);

    assert.equal(canAccountAccessDomain("CUSTOMER", "CUSTOMER"), true);
    assert.equal(canAccountAccessDomain("CUSTOMER", "RESTAURANT_OWNER"), false);
    assert.equal(canAccountAccessDomain("RESTAURANT_OWNER", "DELIVERY_PARTNER"), false);
  });

  it("evaluates loyalty tier via AUTO_ORG_RULE thresholds and respects ADMIN_PINNED overrides", () => {
    const newProfile = createDefaultCustomerGroupProfile({
      completedOrdersCount: 0,
      lifetimeSpendPaise: 0,
    });
    assert.equal(newProfile.loyaltyTier, "NEW");

    const regularTier = resolveEffectiveLoyaltyTier(
      {
        loyaltyTier: "NEW",
        assignmentMode: "AUTO_ORG_RULE",
        completedOrdersCount: 1,
        lifetimeSpendPaise: 35000,
      },
      DEFAULT_ORG_CUSTOMER_GROUP_RULES,
    );
    assert.equal(regularTier, "REGULAR");

    const vipByOrders = resolveEffectiveLoyaltyTier(
      {
        loyaltyTier: "REGULAR",
        assignmentMode: "AUTO_ORG_RULE",
        completedOrdersCount: 3,
        lifetimeSpendPaise: 90000,
      },
      DEFAULT_ORG_CUSTOMER_GROUP_RULES,
    );
    assert.equal(vipByOrders, "VIP");

    const vipBySpend = resolveEffectiveLoyaltyTier(
      {
        loyaltyTier: "REGULAR",
        assignmentMode: "AUTO_ORG_RULE",
        completedOrdersCount: 1,
        lifetimeSpendPaise: 160000,
      },
      DEFAULT_ORG_CUSTOMER_GROUP_RULES,
    );
    assert.equal(vipBySpend, "VIP");

    const pinnedNew = resolveEffectiveLoyaltyTier(
      {
        loyaltyTier: "NEW",
        assignmentMode: "ADMIN_PINNED",
        completedOrdersCount: 25,
        lifetimeSpendPaise: 900000,
      },
      DEFAULT_ORG_CUSTOMER_GROUP_RULES,
    );
    assert.equal(pinnedNew, "NEW");
  });

  it("computes order pricing with NEW welcome discount and VIP free delivery + loyalty discount", () => {
    const newPricing = computeCustomerGroupOrderPricing({
      subtotalPaise: 40000,
      baseDeliveryFeePaise: 3000,
      loyaltyTier: "NEW",
      rules: DEFAULT_ORG_CUSTOMER_GROUP_RULES,
    });
    assert.equal(newPricing.discountPercent, 10);
    assert.equal(newPricing.discountPaise, 4000);
    assert.equal(newPricing.discountedSubtotalPaise, 36000);
    assert.equal(newPricing.deliveryFeePaise, 3000);
    assert.equal(newPricing.deliveryWaived, false);
    assert.equal(newPricing.taxPaise, 1800);
    assert.equal(newPricing.totalPaise, 40800);

    const vipPricing = computeCustomerGroupOrderPricing({
      subtotalPaise: 40000,
      baseDeliveryFeePaise: 3000,
      loyaltyTier: "VIP",
      rules: DEFAULT_ORG_CUSTOMER_GROUP_RULES,
    });
    assert.equal(vipPricing.discountPercent, 5);
    assert.equal(vipPricing.discountPaise, 2000);
    assert.equal(vipPricing.discountedSubtotalPaise, 38000);
    assert.equal(vipPricing.deliveryFeePaise, 0);
    assert.equal(vipPricing.deliveryWaived, true);
    assert.equal(vipPricing.taxPaise, 1900);
    assert.equal(vipPricing.totalPaise, 39900);
  });

  it("validates dietary cohort guardrails for PURE_VEG, VEGAN, and STRICT_JAIN", () => {
    const jainTier2Check = validateOrderForDietaryCohort({
      cohort: "STRICT_JAIN",
      kitchenCertificationLevel: "TIER_2_SEGREGATED_KITCHEN",
      items: [{ name: "Jain Pav Bhaji", isPureVeg: true, isVegan: false, isJain: true }],
    });
    assert.equal(jainTier2Check.ok, false);

    const veganDairyCheck = validateOrderForDietaryCohort({
      cohort: "VEGAN",
      kitchenCertificationLevel: "TIER_1_EXCLUSIVE_VEG",
      items: [{ name: "Paneer Butter Masala", isPureVeg: true, isVegan: false, isJain: false }],
    });
    assert.equal(veganDairyCheck.ok, false);

    const validVeganCheck = validateOrderForDietaryCohort({
      cohort: "VEGAN",
      kitchenCertificationLevel: "TIER_1_EXCLUSIVE_VEG",
      items: [{ name: "Tofu Tikka Bowl", isPureVeg: true, isVegan: true, isJain: false }],
    });
    assert.equal(validVeganCheck.ok, true);
  });

  it("sanitizes Org Customer Group Rules safely within bounds", () => {
    const updated = sanitizeOrgCustomerGroupRules({
      newCustomerDiscountPercent: 85,
      vipMinOrders: 4,
      vipFreeDelivery: false,
    });
    assert.equal(updated.newCustomerDiscountPercent, 50);
    assert.equal(updated.vipMinOrders, 4);
    assert.equal(updated.vipFreeDelivery, false);
  });
});
