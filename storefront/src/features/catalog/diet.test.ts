import { describe, expect, it } from "vitest";
import {
  certificationTier,
  DEFAULT_DIET,
  DIET_OPTIONS,
  dietLabel,
  dietParam,
  findDietViolations,
  isDietFilter,
  matchesDiet,
  toList,
} from "./diet";

describe("diet rules & defaults", () => {
  it("defaults to PURE_VEG and lists Pure Veg first", () => {
    expect(DEFAULT_DIET).toBe("PURE_VEG");
    expect(DIET_OPTIONS[0].value).toBe("PURE_VEG");
    expect(dietLabel("PURE_VEG")).toBe("Pure Veg");
    expect(dietLabel("VEGAN")).toBe("Vegan");
    expect(dietLabel("JAIN")).toBe("Jain");
    expect(dietLabel("ALL")).toBe("All");
  });

  it("validates diet filter values and maps API params", () => {
    expect(isDietFilter("PURE_VEG")).toBe(true);
    expect(isDietFilter("ALL")).toBe(true);
    expect(isDietFilter("INVALID")).toBe(false);
    expect(dietParam("ALL")).toBeNull();
    expect(dietParam("PURE_VEG")).toBe("PURE_VEG");
  });

  it("matches menu items against diet filter", () => {
    const nonVeg = { isPureVeg: false, isVegan: false, isJain: false };
    const veg = { isPureVeg: true, isVegan: false, isJain: false };
    const veganJain = { isPureVeg: true, isVegan: true, isJain: true };

    expect(matchesDiet(nonVeg, "PURE_VEG")).toBe(false);
    expect(matchesDiet(nonVeg, "ALL")).toBe(true);
    expect(matchesDiet(veg, "PURE_VEG")).toBe(true);
    expect(matchesDiet(veg, "VEGAN")).toBe(false);
    expect(matchesDiet(veganJain, "VEGAN")).toBe(true);
    expect(matchesDiet(veganJain, "JAIN")).toBe(true);
  });

  it("parses certification tiers and ingredient/allergen lists", () => {
    expect(certificationTier("TIER_1_EXCLUSIVE_VEG")).toBe(1);
    expect(certificationTier("TIER_2_SEGREGATED_KITCHEN")).toBe(2);
    expect(certificationTier(null)).toBeNull();
    expect(toList("milk, peanuts; soy")).toEqual(["milk", "peanuts", "soy"]);
    expect(toList([" milk ", ""])).toEqual(["milk"]);
  });

  it("enforces DietRules violations for pure-veg, vegan, and Jain items", () => {
    expect(findDietViolations(false, true, false, ["rice"])).toContain("a vegan item must also be marked pure-veg");
    expect(findDietViolations(false, false, true, ["rice"])).toContain("a Jain item must also be marked pure-veg");
    expect(findDietViolations(true, false, false, ["eggplant", "paneer", "ghee"])).toEqual([]);
    expect(findDietViolations(true, false, false, ["chicken", "egg yolk"])).toHaveLength(2);
    expect(findDietViolations(true, true, false, ["coconut milk", "peanut butter", "butter beans"])).toEqual([]);
    expect(findDietViolations(true, true, false, ["ghee", "paneer"])).toHaveLength(2);
    expect(findDietViolations(true, false, true, ["onion", "garlic", "potato"])).toHaveLength(3);
  });
});
