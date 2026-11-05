import { describe, expect, it } from "vitest";
import {
  canAccountAccessDomain,
  computeCustomerGroupOrderPricing,
  DEFAULT_ORG_CUSTOMER_GROUP_RULES,
  resolveAccountDomain,
  resolveEffectiveLoyaltyTier,
  validateOrderForDietaryCohort,
} from "./rules";

describe("customer-groups & domain isolation rules", () => {
  it("resolves accountDomain accurately across hostnames and portal routes", () => {
    expect(resolveAccountDomain({ pathname: "/login" })).toBe("CUSTOMER");
    expect(resolveAccountDomain({ pathname: "/restaurant/login" })).toBe("RESTAURANT_OWNER");
    expect(resolveAccountDomain({ pathname: "/partner/login" })).toBe("DELIVERY_PARTNER");
    expect(resolveAccountDomain({ pathname: "/admin/login" })).toBe("ADMIN");
    expect(canAccountAccessDomain("CUSTOMER", "RESTAURANT_OWNER")).toBe(false);
    expect(canAccountAccessDomain("RESTAURANT_OWNER", "RESTAURANT_OWNER")).toBe(true);
  });

  it("computes loyalty tiers and pricing perks from org rules", () => {
    expect(
      resolveEffectiveLoyaltyTier(
        {
          loyaltyTier: "NEW",
          assignmentMode: "AUTO_ORG_RULE",
          completedOrdersCount: 3,
          lifetimeSpendPaise: 120000,
        },
        DEFAULT_ORG_CUSTOMER_GROUP_RULES,
      ),
    ).toBe("VIP");

    const vipBreakdown = computeCustomerGroupOrderPricing({
      subtotalPaise: 50000,
      loyaltyTier: "VIP",
    });
    expect(vipBreakdown.deliveryFeePaise).toBe(0);
    expect(vipBreakdown.deliveryWaived).toBe(true);
    expect(vipBreakdown.discountPaise).toBe(2500);
  });

  it("enforces dietary cohort rules on orders", () => {
    const res = validateOrderForDietaryCohort({
      cohort: "STRICT_JAIN",
      kitchenCertificationLevel: "TIER_1_EXCLUSIVE_VEG",
      items: [{ name: "Masala Dosa", isPureVeg: true, isVegan: true, isJain: false }],
    });
    expect(res.ok).toBe(false);
  });
});
