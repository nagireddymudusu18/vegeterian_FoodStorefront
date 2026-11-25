import { describe, expect, it } from "vitest";
import type { StaffOrder } from "@/lib/api";
import {
  computeOrderSla,
  filterKitchenOrders,
  formatElapsedClock,
  formatOrderPlacedTime,
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

  it("formats elapsed seconds into MM:SS and Xh YYm kitchen clock strings", () => {
    expect(formatElapsedClock(0)).toBe("00:00");
    expect(formatElapsedClock(-15)).toBe("00:00");
    expect(formatElapsedClock(42)).toBe("00:42");
    expect(formatElapsedClock(374)).toBe("06:14");
    expect(formatElapsedClock(3599)).toBe("59:59");
    expect(formatElapsedClock(3600)).toBe("1h 00m");
    expect(formatElapsedClock(4500)).toBe("1h 15m");
  });

  it("computes SLA urgency tiers, live clock labels, and progress percent from createdAt", () => {
    const now = Date.parse("2026-11-04T16:00:00.000Z");

    const onTime = computeOrderSla("2026-11-04T15:55:00.000Z", now);
    expect(onTime.urgency).toBe("ON_TIME");
    expect(onTime.elapsedSeconds).toBe(300);
    expect(onTime.elapsedClock).toBe("05:00");
    expect(onTime.progressPercent).toBe(25);

    const atRisk = computeOrderSla("2026-11-04T15:45:00.000Z", now);
    expect(atRisk.urgency).toBe("AT_RISK");
    expect(atRisk.elapsedClock).toBe("15:00");
    expect(atRisk.progressPercent).toBe(75);
    expect(atRisk.badgeLabel).toBe("Prep SLA Due");

    const overdue = computeOrderSla("2026-11-04T15:30:00.000Z", now);
    expect(overdue.urgency).toBe("OVERDUE");
    expect(overdue.elapsedClock).toBe("30:00");
    expect(overdue.progressPercent).toBe(100);
    expect(overdue.badgeLabel).toBe("SLA Overdue");

    const longOverdue = computeOrderSla("2026-11-04T14:55:00.000Z", now);
    expect(longOverdue.elapsedClock).toBe("1h 05m");
    expect(longOverdue.elapsedLabel).toBe("1h 5m ago");

    const invalid = computeOrderSla("not-a-timestamp", now);
    expect(invalid.elapsedClock).toBe("00:00");
    expect(invalid.progressPercent).toBe(0);
    expect(formatOrderPlacedTime("not-a-timestamp")).toBeNull();
    expect(formatOrderPlacedTime("2026-11-04T15:55:00.000Z")).toBeTruthy();
  });
});
