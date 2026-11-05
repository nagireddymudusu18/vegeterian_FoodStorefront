import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { StaffOrder } from "@/lib/api";
import {
  computeOrderSla,
  filterKitchenOrders,
  resolveKitchenStage,
  summarizeKitchenBoard,
} from "./kitchen-ops";

const SAMPLE_ORDERS: StaffOrder[] = [
  {
    id: "o1",
    orderNumber: "FA-7K2M9-P4X8Q",
    restaurantName: "Saffron Pure Veg Bhavan",
    status: "PAID",
    totalPaise: 44790,
    cookingInstructions: "Less spicy",
    items: [
      { name: "Paneer Butter Masala", quantity: 1 },
      { name: "Masala Dosa", quantity: 2 },
    ],
    createdAt: "2026-11-04T15:50:00.000Z",
    updatedAt: "2026-11-04T15:50:00.000Z",
  },
  {
    id: "o2",
    orderNumber: "FA-3R8W5-V2N6J",
    restaurantName: "Green Leaf Vegan Kitchen",
    status: "PREPARING",
    totalPaise: 52140,
    cookingInstructions: "Strictly dairy-free",
    items: [{ name: "Tofu Tikka Bowl", quantity: 1 }],
    createdAt: "2026-11-04T15:40:00.000Z",
    updatedAt: "2026-11-04T15:45:00.000Z",
  },
  {
    id: "o3",
    orderNumber: "FA-9B4C7-M5T2H",
    restaurantName: "Saffron Pure Veg Bhavan",
    status: "PICKED_UP",
    totalPaise: 29900,
    cookingInstructions: null,
    items: [{ name: "Idli Sambar", quantity: 2 }],
    createdAt: "2026-11-04T15:25:00.000Z",
    updatedAt: "2026-11-04T15:48:00.000Z",
  },
];

describe("kitchen-ops pure logic (node:test)", () => {
  it("maps statuses to kitchen queue stages and summarizes board KPIs", () => {
    assert.equal(resolveKitchenStage("PAID"), "NEW");
    assert.equal(resolveKitchenStage("MERCHANT_ACCEPTED"), "ACCEPTED");
    assert.equal(resolveKitchenStage("PREPARING"), "PREPARING");
    assert.equal(resolveKitchenStage("PICKED_UP"), "DISPATCH");

    const summary = summarizeKitchenBoard(SAMPLE_ORDERS);
    assert.equal(summary.totalCount, 3);
    assert.equal(summary.newCount, 1);
    assert.equal(summary.acceptedCount, 0);
    assert.equal(summary.preparingCount, 1);
    assert.equal(summary.dispatchCount, 1);
    assert.equal(summary.totalRevenuePaise, 126830);
    assert.equal(summary.totalItemsCount, 6);
  });

  it("filters orders by outlet name, stage, and search query", () => {
    const saffronOnly = filterKitchenOrders(SAMPLE_ORDERS, {
      restaurantName: "Saffron Pure Veg Bhavan",
    });
    assert.equal(saffronOnly.length, 2);

    const preparingOnly = filterKitchenOrders(SAMPLE_ORDERS, { stage: "PREPARING" });
    assert.equal(preparingOnly.length, 1);
    assert.equal(preparingOnly[0].id, "o2");

    const byDish = filterKitchenOrders(SAMPLE_ORDERS, { query: "tofu tikka" });
    assert.equal(byDish.length, 1);
    assert.equal(byDish[0].id, "o2");

    const byNote = filterKitchenOrders(SAMPLE_ORDERS, { query: "less spicy" });
    assert.equal(byNote.length, 1);
    assert.equal(byNote[0].id, "o1");
  });

  it("computes SLA elapsed minutes and urgency tiers", () => {
    const now = Date.parse("2026-11-04T16:00:00.000Z");
    const onTime = computeOrderSla("2026-11-04T15:54:00.000Z", now);
    assert.equal(onTime.elapsedMinutes, 6);
    assert.equal(onTime.urgency, "ON_TIME");

    const atRisk = computeOrderSla("2026-11-04T15:46:00.000Z", now);
    assert.equal(atRisk.elapsedMinutes, 14);
    assert.equal(atRisk.urgency, "AT_RISK");

    const overdue = computeOrderSla("2026-11-04T15:35:00.000Z", now);
    assert.equal(overdue.elapsedMinutes, 25);
    assert.equal(overdue.urgency, "OVERDUE");
  });
});
