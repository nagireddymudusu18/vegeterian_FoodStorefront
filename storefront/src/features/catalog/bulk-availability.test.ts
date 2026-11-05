import { describe, expect, it } from "vitest";
import {
  applyBulkAvailabilityToMenu,
  computeBulkPricePreview,
  selectDishesByAvailability,
  summarizeBulkSelection,
  toggleDishSelection,
  toggleSelectAllDishes,
} from "./bulk-availability";

const SAMPLE_MENU = [
  { id: "d1", name: "Masala Dosa", available: true, pricePaise: 14000 },
  { id: "d2", name: "Idli Vada", available: true, pricePaise: 9000 },
  { id: "d3", name: "Rava Kesari", available: false, pricePaise: 11000 },
];

describe("bulk-availability", () => {
  it("toggles individual dish IDs in selection", () => {
    const s1 = toggleDishSelection([], "d1");
    expect(s1).toEqual(["d1"]);
    const s2 = toggleDishSelection(s1, "d2");
    expect(s2).toEqual(["d1", "d2"]);
    expect(toggleDishSelection(s2, "d1")).toEqual(["d2"]);
  });

  it("selects all dishes and clears when all are already selected", () => {
    const all = toggleSelectAllDishes(SAMPLE_MENU, ["d1"]);
    expect(all).toEqual(["d1", "d2", "d3"]);
    expect(toggleSelectAllDishes(SAMPLE_MENU, all)).toEqual([]);
  });

  it("selects dishes by current availability status", () => {
    expect(selectDishesByAvailability(SAMPLE_MENU, true)).toEqual(["d1", "d2"]);
    expect(selectDishesByAvailability(SAMPLE_MENU, false)).toEqual(["d3"]);
  });

  it("summarizes selection and computes bulk action targets", () => {
    const summary = summarizeBulkSelection(SAMPLE_MENU, ["d1", "d3", "unknown"]);
    expect(summary.totalSelected).toBe(2);
    expect(summary.availableCount).toBe(1);
    expect(summary.unavailableCount).toBe(1);
    expect(summary.allSelected).toBe(false);
    expect(summary.someSelected).toBe(true);
    expect(summary.targetIdsToMakeAvailable).toEqual(["d3"]);
    expect(summary.targetIdsToMakeUnavailable).toEqual(["d1"]);
    expect(summary.invertedTargets).toEqual([
      { id: "d1", available: false },
      { id: "d3", available: true },
    ]);
  });

  it("computes bulk price previews for exact, amount, and percentage modes", () => {
    const exact = computeBulkPricePreview(SAMPLE_MENU, ["d1", "d2"], "SET_EXACT", "175");
    expect(exact.valid).toBe(true);
    expect(exact.changes[0].newPricePaise).toBe(17500);
    expect(exact.changes[1].newPricePaise).toBe(17500);

    const delta = computeBulkPricePreview(SAMPLE_MENU, ["d1"], "ADJUST_AMOUNT", "25");
    expect(delta.valid).toBe(true);
    expect(delta.changes[0].newPricePaise).toBe(16500);

    const pct = computeBulkPricePreview(SAMPLE_MENU, ["d2"], "ADJUST_PERCENT", "10");
    expect(pct.valid).toBe(true);
    expect(pct.changes[0].newPricePaise).toBe(9900);

    expect(computeBulkPricePreview(SAMPLE_MENU, ["d1"], "SET_EXACT", "-10").valid).toBe(false);
  });

  it("merges updated items into menu immutably", () => {
    const updated = applyBulkAvailabilityToMenu(SAMPLE_MENU, [
      { id: "d1", name: "Masala Dosa", available: false, pricePaise: 15500 },
    ]);
    expect(updated[0].available).toBe(false);
    expect(updated[0].pricePaise).toBe(15500);
    expect(updated[1].available).toBe(true);
    expect(SAMPLE_MENU[0].available).toBe(true);
  });
});
