import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
  {
    orderId: "ord_2",
    orderNumber: "FA-3R8W5-V2N6J",
    restaurantName: "Green Leaf Vegan Kitchen",
    deliveryAddress: "12th Main, Indiranagar",
    status: "PICKED_UP",
    partnerId: "p1",
    createdAt: "2026-11-04T15:40:00.000Z",
    updatedAt: "2026-11-04T15:48:00.000Z",
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

describe("rider-ops pure logic (node:test)", () => {
  it("computes shift KPIs, earnings, and capacity limit", () => {
    assert.equal(estimateDeliveryPayoutPaise({ payoutPaise: 5200 }), 5200);
    assert.equal(estimateDeliveryPayoutPaise({}), 4500);

    const summary = summarizeRiderShift(ACTIVE, HISTORY);
    assert.equal(summary.activeCount, 2);
    assert.equal(summary.assignedCount, 1);
    assert.equal(summary.pickedUpCount, 1);
    assert.equal(summary.completedCount, 1);
    assert.equal(summary.completedEarningsPaise, 5000);
    assert.equal(summary.activePotentialPaise, 9000);
    assert.equal(summary.atCapacity, true);
  });

  it("maps delivery statuses to step-by-step instructions", () => {
    assert.equal(resolveRiderStep("ASSIGNED").stepNumber, 1);
    assert.equal(resolveRiderStep("PICKED_UP").stepNumber, 2);
    assert.equal(resolveRiderStep("DELIVERED").stepNumber, 3);
  });

  it("filters deliveries by order code, restaurant, or drop-off address", () => {
    assert.equal(filterRiderDeliveries(ACTIVE, "indiranagar").length, 1);
    assert.equal(filterRiderDeliveries(ACTIVE, "saffron").length, 1);
    assert.equal(filterRiderDeliveries(ACTIVE, "FA-3R8W5").length, 1);
  });
});
