import { describe, expect, it } from "vitest";
import type { Delivery } from "@/lib/api";
import {
  estimateDeliveryPayoutPaise,
  filterRiderDeliveries,
  resolveRiderStep,
  summarizeRiderShift,
} from "./rider-ops";

const ACTIVE: Delivery[] = [
  {
    orderId: "ord_1",
    orderNumber: "FA-7K2M9-P4X8Q",
    restaurantName: "Saffron Pure Veg Bhavan",
    deliveryAddress: "MG Road, Bengaluru",
    payoutPaise: 4500,
    status: "ASSIGNED",
    partnerId: "p1",
    createdAt: "2026-11-04T15:50:00.000Z",
    updatedAt: "2026-11-04T15:52:00.000Z",
  },
];

const HISTORY: Delivery[] = [
  {
    orderId: "ord_3",
    orderNumber: "FA-9B4C7-M5T2H",
    restaurantName: "Jain Rasoi",
    deliveryAddress: "4th Block, Jayanagar",
    payoutPaise: 5000,
    status: "DELIVERED",
    partnerId: "p1",
    createdAt: "2026-11-04T14:50:00.000Z",
    updatedAt: "2026-11-04T15:15:00.000Z",
  },
];

describe("rider-ops", () => {
  it("summarizes shift metrics and payout", () => {
    expect(estimateDeliveryPayoutPaise({ payoutPaise: 5000 })).toBe(5000);
    const s = summarizeRiderShift(ACTIVE, HISTORY);
    expect(s.activeCount).toBe(1);
    expect(s.completedCount).toBe(1);
    expect(s.completedEarningsPaise).toBe(5000);
    expect(s.atCapacity).toBe(false);
  });

  it("resolves step guidance and filters by address or order number", () => {
    expect(resolveRiderStep("ASSIGNED").stepNumber).toBe(1);
    expect(resolveRiderStep("PICKED_UP").stepNumber).toBe(2);
    expect(filterRiderDeliveries(ACTIVE, "MG Road")).toHaveLength(1);
  });
});
