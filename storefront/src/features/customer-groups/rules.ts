export type AccountDomain = "CUSTOMER" | "RESTAURANT_OWNER" | "DELIVERY_PARTNER" | "ADMIN";

export type CustomerLoyaltyTier = "NEW" | "REGULAR" | "VIP";
export type CustomerDietaryCohort = "PURE_VEG" | "VEGAN" | "STRICT_JAIN";
export type GroupAssignmentMode = "AUTO_ORG_RULE" | "ADMIN_PINNED";

export interface CustomerGroupProfile {
  loyaltyTier: CustomerLoyaltyTier;
  dietaryCohort: CustomerDietaryCohort;
  assignmentMode: GroupAssignmentMode;
  completedOrdersCount: number;
  lifetimeSpendPaise: number;
  updatedAt?: string;
  updatedBy?: string | null;
}

export interface OrgCustomerGroupRules {
  newCustomerDiscountPercent: number;
  regularMinOrders: number;
  vipMinOrders: number;
  vipMinSpendPaise: number;
  vipFreeDelivery: boolean;
  vipDiscountPercent: number;
  enforceCohortDietLock: boolean;
  strictJainTier1Only: boolean;
  updatedAt: string;
  updatedBy?: string | null;
}

export interface CustomerGroupPricingBreakdown {
  subtotalPaise: number;
  discountPercent: number;
  discountPaise: number;
  discountedSubtotalPaise: number;
  taxPaise: number;
  deliveryFeePaise: number;
  deliveryWaived: boolean;
  totalPaise: number;
  appliedRuleSummary: string;
}

export const ACCOUNT_DOMAIN_LABELS: Record<AccountDomain, string> = {
  CUSTOMER: "Customer",
  RESTAURANT_OWNER: "Restaurant Owner",
  DELIVERY_PARTNER: "Delivery Partner",
  ADMIN: "Org Admin",
};

export const ACCOUNT_DOMAIN_META: Record<
  AccountDomain,
  { label: string; shortLabel: string; portalPath: string; badgeClass: string }
> = {
  CUSTOMER: {
    label: "Customer Storefront",
    shortLabel: "Customer",
    portalPath: "/login",
    badgeClass: "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200",
  },
  RESTAURANT_OWNER: {
    label: "Restaurant Partner",
    shortLabel: "Restaurant Owner",
    portalPath: "/restaurant/login",
    badgeClass: "bg-amber-100 text-amber-950 ring-1 ring-amber-300",
  },
  DELIVERY_PARTNER: {
    label: "Delivery Partner",
    shortLabel: "Delivery Partner",
    portalPath: "/partner/login",
    badgeClass: "bg-sky-100 text-sky-950 ring-1 ring-sky-300",
  },
  ADMIN: {
    label: "Org Admin",
    shortLabel: "Org Admin",
    portalPath: "/admin/login",
    badgeClass: "bg-stone-900 text-white",
  },
};

export const LOYALTY_TIER_META: Record<
  CustomerLoyaltyTier,
  { label: string; shortLabel: string; badgeClass: string; summary: string }
> = {
  NEW: {
    label: "New Customer",
    shortLabel: "New",
    badgeClass: "bg-amber-100 text-amber-950 ring-1 ring-amber-300",
    summary: "Welcome tier with an introductory discount on your first orders.",
  },
  REGULAR: {
    label: "Regular Member",
    shortLabel: "Regular",
    badgeClass: "bg-stone-100 text-stone-800 ring-1 ring-stone-300",
    summary: "Verified recurring member progressing toward VIP Veggo Pass status.",
  },
  VIP: {
    label: "VIP · Veggo Pass",
    shortLabel: "VIP",
    badgeClass: "bg-green-100 text-green-900 ring-1 ring-green-300",
    summary: "Priority member eligible for ₹0 free delivery and ongoing loyalty savings.",
  },
};

export const DIETARY_COHORT_META: Record<
  CustomerDietaryCohort,
  { label: string; shortLabel: string; dietFilter: "PURE_VEG" | "VEGAN" | "JAIN"; badgeClass: string; description: string }
> = {
  PURE_VEG: {
    label: "100% Pure Veg",
    shortLabel: "Pure Veg",
    dietFilter: "PURE_VEG",
    badgeClass: "bg-green-50 text-green-900 ring-1 ring-green-200",
    description: "100% vegetarian dishes; meat, fish, and egg are blocked at checkout.",
  },
  VEGAN: {
    label: "100% Vegan",
    shortLabel: "Vegan",
    dietFilter: "VEGAN",
    badgeClass: "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200",
    description: "Strictly plant-based; dairy, ghee, paneer, curd, and honey are blocked.",
  },
  STRICT_JAIN: {
    label: "Strict Jain (Satvik)",
    shortLabel: "Strict Jain",
    dietFilter: "JAIN",
    badgeClass: "bg-amber-50 text-amber-950 ring-1 ring-amber-200",
    description: "No onion, garlic, or root vegetables; Tier-1 exclusive veg kitchens enforced.",
  },
};

export const DEFAULT_ORG_CUSTOMER_GROUP_RULES: OrgCustomerGroupRules = {
  newCustomerDiscountPercent: 10,
  regularMinOrders: 1,
  vipMinOrders: 3,
  vipMinSpendPaise: 150000, // ₹1,500
  vipFreeDelivery: true,
  vipDiscountPercent: 5,
  enforceCohortDietLock: true,
  strictJainTier1Only: true,
  updatedAt: "2026-01-15T08:00:00.000Z",
  updatedBy: null,
};

export function isValidAccountDomain(value: unknown): value is AccountDomain {
  return (
    value === "CUSTOMER" ||
    value === "RESTAURANT_OWNER" ||
    value === "DELIVERY_PARTNER" ||
    value === "ADMIN"
  );
}

/**
 * Resolves the active account domain from explicit input, HTTP hostname, or portal URL pathname.
 */
export function resolveAccountDomain(input: {
  explicitDomain?: string | null;
  hostname?: string | null;
  pathname?: string | null;
}): AccountDomain {
  const explicit = input.explicitDomain?.trim().toUpperCase();
  if (isValidAccountDomain(explicit)) {
    return explicit;
  }

  const host = (input.hostname ?? "").trim().toLowerCase();
  if (host.startsWith("admin.")) return "ADMIN";
  if (host.startsWith("restaurant.") || host.startsWith("kitchen.")) return "RESTAURANT_OWNER";
  if (host.startsWith("partner.") || host.startsWith("fleet.") || host.startsWith("rider.")) {
    return "DELIVERY_PARTNER";
  }

  const path = (input.pathname ?? "").trim();
  if (/^\/admin(?:$|[/?#])/.test(path)) return "ADMIN";
  if (/^\/restaurant(?:$|[/?#])/.test(path)) return "RESTAURANT_OWNER";
  if (/^\/partner(?:$|[/?#])/.test(path)) return "DELIVERY_PARTNER";
  return "CUSTOMER";
}

export function defaultRolesForAccountDomain(domain: AccountDomain): string[] {
  switch (domain) {
    case "ADMIN":
      return ["ADMIN"];
    case "RESTAURANT_OWNER":
      return ["RESTAURANT"];
    case "DELIVERY_PARTNER":
      return ["PARTNER"];
    case "CUSTOMER":
    default:
      return ["CUSTOMER"];
  }
}

export function canAccountAccessDomain(accountDomain: AccountDomain, targetDomain: AccountDomain): boolean {
  return accountDomain === targetDomain;
}

/**
 * Evaluates a customer's effective Loyalty Tier using either an Admin-pinned tier or live Org Rules thresholds.
 */
export function resolveEffectiveLoyaltyTier(
  profile: Pick<
    CustomerGroupProfile,
    "loyaltyTier" | "assignmentMode" | "completedOrdersCount" | "lifetimeSpendPaise"
  >,
  rules: OrgCustomerGroupRules = DEFAULT_ORG_CUSTOMER_GROUP_RULES,
): CustomerLoyaltyTier {
  if (profile.assignmentMode === "ADMIN_PINNED") {
    return profile.loyaltyTier;
  }

  const orders = Math.max(0, Math.floor(profile.completedOrdersCount || 0));
  const spend = Math.max(0, Math.floor(profile.lifetimeSpendPaise || 0));

  const meetsVipByOrders = rules.vipMinOrders > 0 && orders >= rules.vipMinOrders;
  const meetsVipBySpend = rules.vipMinSpendPaise > 0 && spend >= rules.vipMinSpendPaise;
  if (meetsVipByOrders || meetsVipBySpend) {
    return "VIP";
  }

  if (orders >= Math.max(1, rules.regularMinOrders)) {
    return "REGULAR";
  }

  return "NEW";
}

export function createDefaultCustomerGroupProfile(
  overrides: Partial<CustomerGroupProfile> = {},
  rules: OrgCustomerGroupRules = DEFAULT_ORG_CUSTOMER_GROUP_RULES,
): CustomerGroupProfile {
  const base: CustomerGroupProfile = {
    loyaltyTier: overrides.loyaltyTier ?? "NEW",
    dietaryCohort: overrides.dietaryCohort ?? "PURE_VEG",
    assignmentMode: overrides.assignmentMode ?? "AUTO_ORG_RULE",
    completedOrdersCount: overrides.completedOrdersCount ?? 0,
    lifetimeSpendPaise: overrides.lifetimeSpendPaise ?? 0,
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
    updatedBy: overrides.updatedBy ?? null,
  };
  base.loyaltyTier = resolveEffectiveLoyaltyTier(base, rules);
  return base;
}

/**
 * Computes order pricing (discount, delivery fee waiver, 5% GST, and total) from the customer's Loyalty Tier and Org Rules.
 */
export function computeCustomerGroupOrderPricing(
  inputOrSubtotal:
    | {
        subtotalPaise: number;
        baseDeliveryFeePaise?: number;
        loyaltyTier: CustomerLoyaltyTier;
        rules?: OrgCustomerGroupRules;
      }
    | number,
  loyaltyTierArg?: CustomerLoyaltyTier,
  rulesArg?: OrgCustomerGroupRules,
): CustomerGroupPricingBreakdown {
  const input =
    typeof inputOrSubtotal === "number"
      ? {
          subtotalPaise: inputOrSubtotal,
          loyaltyTier: loyaltyTierArg ?? "NEW",
          rules: rulesArg,
        }
      : inputOrSubtotal;
  const rules = input.rules ?? DEFAULT_ORG_CUSTOMER_GROUP_RULES;
  const subtotalPaise = Math.max(0, Math.round(input.subtotalPaise || 0));
  const baseDeliveryFeePaise = Math.max(0, Math.round(input.baseDeliveryFeePaise ?? 3000));

  let discountPercent = 0;
  if (input.loyaltyTier === "VIP") {
    discountPercent = Math.min(50, Math.max(0, Math.round(rules.vipDiscountPercent || 0)));
  } else if (input.loyaltyTier === "NEW") {
    discountPercent = Math.min(50, Math.max(0, Math.round(rules.newCustomerDiscountPercent || 0)));
  }

  const discountPaise = Math.round((subtotalPaise * discountPercent) / 100);
  const discountedSubtotalPaise = Math.max(0, subtotalPaise - discountPaise);
  const deliveryWaived = input.loyaltyTier === "VIP" && Boolean(rules.vipFreeDelivery);
  const deliveryFeePaise = deliveryWaived ? 0 : baseDeliveryFeePaise;
  const taxPaise = Math.round((discountedSubtotalPaise * 5) / 100);
  const totalPaise = discountedSubtotalPaise + taxPaise + deliveryFeePaise;

  let appliedRuleSummary = "Regular Member: Standard delivery & menu pricing";
  if (input.loyaltyTier === "VIP") {
    const parts: string[] = [];
    if (deliveryWaived) parts.push("₹0 Free Delivery");
    if (discountPercent > 0) parts.push(`${discountPercent}% VIP Loyalty Discount`);
    appliedRuleSummary =
      parts.length > 0 ? `VIP · Veggo Pass: ${parts.join(" + ")}` : "VIP · Veggo Pass Member";
  } else if (input.loyaltyTier === "NEW" && discountPercent > 0) {
    appliedRuleSummary = `New Customer Welcome Perk: ${discountPercent}% off food subtotal`;
  }

  return {
    subtotalPaise,
    discountPercent,
    discountPaise,
    discountedSubtotalPaise,
    taxPaise,
    deliveryFeePaise,
    deliveryWaived,
    totalPaise,
    appliedRuleSummary,
  };
}

/**
 * Validates whether a restaurant and cart items satisfy the customer's assigned Dietary Cohort under Org Rules.
 */
export function validateOrderForDietaryCohort(input: {
  cohort: CustomerDietaryCohort;
  rules?: OrgCustomerGroupRules;
  kitchenCertificationLevel?: string | number | null;
  items: {
    name: string;
    isPureVeg?: boolean;
    isVegan?: boolean;
    isJain?: boolean;
  }[];
}): { ok: true } | { ok: false; reason: string } {
  const rules = input.rules ?? DEFAULT_ORG_CUSTOMER_GROUP_RULES;
  if (!rules.enforceCohortDietLock) {
    return { ok: true };
  }

  if (
    input.cohort === "STRICT_JAIN" &&
    rules.strictJainTier1Only &&
    input.kitchenCertificationLevel &&
    String(input.kitchenCertificationLevel).toUpperCase().includes("TIER_2")
  ) {
    return {
      ok: false,
      reason:
        "Your account is in the Strict Jain cohort, which only permits orders from Tier-1 Exclusive Veg kitchens under Org Rules.",
    };
  }

  const violatingNames: string[] = [];
  for (const item of input.items) {
    if (item.isPureVeg === false) {
      violatingNames.push(item.name);
      continue;
    }
    if (input.cohort === "VEGAN" && !item.isVegan) {
      violatingNames.push(item.name);
      continue;
    }
    if (input.cohort === "STRICT_JAIN" && !item.isJain) {
      violatingNames.push(item.name);
    }
  }

  if (violatingNames.length > 0) {
    const cohortLabel = DIETARY_COHORT_META[input.cohort].label;
    return {
      ok: false,
      reason: `Cohort guardrail (${cohortLabel}): ${violatingNames.join(", ")} cannot be ordered under your assigned dietary group.`,
    };
  }

  return { ok: true };
}

/**
 * Validates and normalizes updates to the Org Customer Group Rules.
 */
export function sanitizeOrgCustomerGroupRules(
  patch: Partial<OrgCustomerGroupRules>,
  current: OrgCustomerGroupRules = DEFAULT_ORG_CUSTOMER_GROUP_RULES,
  actorId?: string | null,
): OrgCustomerGroupRules {
  const clampInt = (val: unknown, fallback: number, min: number, max: number) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  };

  return {
    newCustomerDiscountPercent: clampInt(
      patch.newCustomerDiscountPercent,
      current.newCustomerDiscountPercent,
      0,
      50,
    ),
    regularMinOrders: clampInt(patch.regularMinOrders, current.regularMinOrders, 1, 50),
    vipMinOrders: clampInt(patch.vipMinOrders, current.vipMinOrders, 1, 200),
    vipMinSpendPaise: clampInt(patch.vipMinSpendPaise, current.vipMinSpendPaise, 0, 10_000_000),
    vipFreeDelivery:
      typeof patch.vipFreeDelivery === "boolean" ? patch.vipFreeDelivery : current.vipFreeDelivery,
    vipDiscountPercent: clampInt(patch.vipDiscountPercent, current.vipDiscountPercent, 0, 50),
    enforceCohortDietLock:
      typeof patch.enforceCohortDietLock === "boolean"
        ? patch.enforceCohortDietLock
        : current.enforceCohortDietLock,
    strictJainTier1Only:
      typeof patch.strictJainTier1Only === "boolean"
        ? patch.strictJainTier1Only
        : current.strictJainTier1Only,
    updatedAt: new Date().toISOString(),
    updatedBy: actorId ?? current.updatedBy ?? null,
  };
}
