import test from "node:test";
import assert from "node:assert/strict";
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

test("toggleDishSelection adds and removes dish IDs cleanly", () => {
  const s1 = toggleDishSelection([], "d1");
  assert.deepEqual(s1, ["d1"]);
  const s2 = toggleDishSelection(s1, "d2");
  assert.deepEqual(s2, ["d1", "d2"]);
  const s3 = toggleDishSelection(s2, "d1");
  assert.deepEqual(s3, ["d2"]);
});

test("toggleSelectAllDishes selects all when partial, and clears when all selected", () => {
  const all = toggleSelectAllDishes(SAMPLE_MENU, ["d1"]);
  assert.deepEqual(all, ["d1", "d2", "d3"]);
  const cleared = toggleSelectAllDishes(SAMPLE_MENU, all);
  assert.deepEqual(cleared, []);
});

test("selectDishesByAvailability filters by available or 86d status", () => {
  assert.deepEqual(selectDishesByAvailability(SAMPLE_MENU, true), ["d1", "d2"]);
  assert.deepEqual(selectDishesByAvailability(SAMPLE_MENU, false), ["d3"]);
});

test("summarizeBulkSelection calculates counts, targets, and inverted states", () => {
  const summary = summarizeBulkSelection(SAMPLE_MENU, ["d1", "d3", "stale-id"]);
  assert.equal(summary.totalSelected, 2);
  assert.equal(summary.availableCount, 1);
  assert.equal(summary.unavailableCount, 1);
  assert.equal(summary.allSelected, false);
  assert.equal(summary.someSelected, true);
  assert.deepEqual(summary.selectedIds, ["d1", "d3"]);
  assert.deepEqual(summary.targetIdsToMakeAvailable, ["d3"]);
  assert.deepEqual(summary.targetIdsToMakeUnavailable, ["d1"]);
  assert.deepEqual(summary.invertedTargets, [
    { id: "d1", available: false },
    { id: "d3", available: true },
  ]);
});

test("computeBulkPricePreview calculates exact, amount delta, and percent delta prices", () => {
  const exact = computeBulkPricePreview(SAMPLE_MENU, ["d1", "d2"], "SET_EXACT", "175");
  assert.equal(exact.valid, true);
  assert.deepEqual(
    exact.changes.map((c) => ({ id: c.id, old: c.oldPricePaise, next: c.newPricePaise, delta: c.deltaPaise })),
    [
      { id: "d1", old: 14000, next: 17500, delta: 3500 },
      { id: "d2", old: 9000, next: 17500, delta: 8500 },
    ],
  );

  const amountDelta = computeBulkPricePreview(SAMPLE_MENU, ["d1", "d2"], "ADJUST_AMOUNT", "-20");
  assert.equal(amountDelta.valid, true);
  assert.equal(amountDelta.changes[0].newPricePaise, 12000);
  assert.equal(amountDelta.changes[1].newPricePaise, 7000);

  const pctDelta = computeBulkPricePreview(SAMPLE_MENU, ["d1"], "ADJUST_PERCENT", "10");
  assert.equal(pctDelta.valid, true);
  assert.equal(pctDelta.changes[0].newPricePaise, 15400);

  const invalidNeg = computeBulkPricePreview(SAMPLE_MENU, ["d1"], "SET_EXACT", "-5");
  assert.equal(invalidNeg.valid, false);
});

test("applyBulkAvailabilityToMenu immutably replaces updated items", () => {
  const next = applyBulkAvailabilityToMenu(SAMPLE_MENU, [
    { id: "d1", name: "Masala Dosa", available: false, pricePaise: 16000 },
    { id: "d3", name: "Rava Kesari", available: true, pricePaise: 11000 },
  ]);
  assert.deepEqual(
    next.map((m) => ({ id: m.id, available: m.available, pricePaise: m.pricePaise })),
    [
      { id: "d1", available: false, pricePaise: 16000 },
      { id: "d2", available: true, pricePaise: 9000 },
      { id: "d3", available: true, pricePaise: 11000 },
    ],
  );
  assert.equal(SAMPLE_MENU[0].available, true);
});
