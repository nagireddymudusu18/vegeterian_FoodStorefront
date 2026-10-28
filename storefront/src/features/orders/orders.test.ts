import { describe, expect, it } from "vitest";
import { canCancel, isTerminal, stepState } from "./orders";
import { certificationTier, matchesDiet, toList } from "@/features/catalog";

describe("order status helpers", () => {
  it("computes stepper states", () => {
    expect(stepState("PREPARING", "PAID")).toBe("done");
    expect(stepState("PREPARING", "PREPARING")).toBe("current");
    expect(stepState("PREPARING", "DELIVERED")).toBe("upcoming");
    expect(stepState("DELIVERED", "DELIVERED")).toBe("done");
  });
  it("knows terminal and cancellable states", () => {
    expect(isTerminal("DELIVERED")).toBe(true);
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("PREPARING")).toBe(false);
    expect(canCancel("CREATED")).toBe(true);
    expect(canCancel("PICKED_UP")).toBe(false);
  });
});

describe("diet helpers", () => {
  it("filters by diet flags", () => {
    const item = { isPureVeg: true, isVegan: false, isJain: false };
    expect(matchesDiet(item, "ALL")).toBe(true);
    expect(matchesDiet(item, "PURE_VEG")).toBe(true);
    expect(matchesDiet(item, "VEGAN")).toBe(false);
  });
  it("maps certification levels to tiers", () => {
    expect(certificationTier("TIER_1")).toBe(1);
    expect(certificationTier("EXCLUSIVE_VEG")).toBe(1);
    expect(certificationTier(2)).toBe(2);
    expect(certificationTier("SEGREGATED")).toBe(2);
    expect(certificationTier(null)).toBeNull();
  });
  it("normalises lists", () => {
    expect(toList("milk, nuts;soy")).toEqual(["milk", "nuts", "soy"]);
    expect(toList(null)).toEqual([]);
    expect(toList(["a", " b "])).toEqual(["a", "b"]);
  });
});
