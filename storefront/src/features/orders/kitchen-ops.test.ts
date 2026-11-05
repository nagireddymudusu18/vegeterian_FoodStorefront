import { describe, expect, it } from "vitest";
import type { StaffOrder } from "@/lib/api";
import {
  computeOrderSla,
  filterKitchenOrders,
  resolveKitchenStage,
  summarizeKitchenBoard,
} from "./kitchen-ops";

const ORDERS: StaffOrder[] = [
  {
    id: "o1",
    orderNumber: "FA-7K2M9-P4X8Q",
    restaurantName: "Saffron Pure Veg Bhavan",
    status: "PAID",
    totalPaise: 44790,
    cookingInstructions: "Less spicy",
    items: [{ name: "Paneer Butter Masala", quantity: 2 }],
    createdAt: "2026-11-04T15:50:00.000Z",
    updatedAt: "2026-11-04T15:50:00.000Z",
  },
  {
    id: "o2",
    orderNumber: "FA-3R8W5-V2N6J",
    restaurantName: "Green Leaf Vegan Kitchen",
    status: "PREPARING",
    totalPaise: 52140,
    cookingInstructions: "Dairy-free",
    items: [{ name: "Tofu Tikka Bowl", quantity: 1 }],
    createdAt: "2026-11-04T15:40:00.000Z",
    updatedAt: "2026-11-04T15:45:00.000Z",
  },
];

describe("kitchen-ops", () => {
  it("resolves stages and summarizes KPIs", () => {
    expect(resolveKitchenStage("PAID")).toBe("NEW");
    expect(resolveKitchenStage("PREPARING")).toBe("PREPARING");
    const s = summarizeKitchenBoard(ORDERS);
    expect(s.totalCount).toBe(2);
    expect(s.newCount).toBe(1);
    expect(s.preparingCount).toBe(1);
    expect(s.totalRevenuePaise).toBe(96930);
    expect(s.totalItemsCount).toBe(3);
  });

  it("filters by outlet, stage, and search query", () => {
    expect(filterKitchenOrders(ORDERS, { restaurantName: "Saffron Pure Veg Bhavan" })).toHaveLength(1);
    expect(filterKitchenOrders(ORDERS, { stage: "PREPARING" })).toHaveLength(1);
    expect(filterKitchenOrders(ORDERS, { query: "tofu" })).toHaveLength(1);
  });

  it("computes SLA urgency tiers", () => {
    const now = Date.parse("2026-11-04T16:00:00.000Z");
    expect(computeOrderSla("2026-11-04T15:55:00.000Z", now).urgency).toBe("ON_TIME");
    expect(computeOrderSla("2026-11-04T15:45:00.000Z", now).urgency).toBe("AT_RISK");
    expect(computeOrderSla("2026-11-04T15:30:00.000Z", now).urgency).toBe("OVERDUE");
  });
});
