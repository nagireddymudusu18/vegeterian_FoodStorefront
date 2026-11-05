import test from "node:test";
import assert from "node:assert/strict";
import type { Order } from "@/lib/api";
import {
  cancellationPolicySummary,
  computeCustomerOrderStats,
  filterCustomerOrders,
  formatCancellationReason,
  refundStatusBanner,
} from "./customer-ops";

const SAMPLE_ORDERS: Order[] = [
  {
    id: "ord_1",
    orderNumber: "FA-7K2M9-P4X8Q",
    restaurantName: "Saffron Pure Veg Bhavan",
    status: "PAID",
    subtotalPaise: 39800,
    taxPaise: 1990,
    deliveryFeePaise: 3000,
    totalPaise: 44790,
    items: [{ name: "Paneer Butter Masala", quantity: 1 }],
  },
  {
    id: "ord_2",
    orderNumber: "FA-9B4C7-M5T2H",
    restaurantName: "Jain Rasoi",
    status: "DELIVERED",
    subtotalPaise: 29800,
    taxPaise: 1490,
    deliveryFeePaise: 3000,
    totalPaise: 34290,
    items: [{ name: "Jain Pav Bhaji", quantity: 1 }],
  },
  {
    id: "ord_3",
    orderNumber: "FA-1X2Y3-Z4W5V",
    restaurantName: "Green Leaf Vegan Kitchen",
    status: "REFUNDED",
    subtotalPaise: 25900,
    taxPaise: 1295,
    deliveryFeePaise: 3000,
    totalPaise: 30195,
    cancellationReason: "Changed my mind",
    items: [{ name: "Jackfruit Biryani", quantity: 1 }],
  },
];

test("cancellationPolicySummary marks CREATED, PAID, and MERCHANT_ACCEPTED eligible and PREPARING locked", () => {
  assert.equal(cancellationPolicySummary("PAID").eligible, true);
  assert.equal(cancellationPolicySummary("MERCHANT_ACCEPTED").eligible, true);
  assert.equal(cancellationPolicySummary("PREPARING").eligible, false);
  assert.equal(cancellationPolicySummary("DELIVERED").eligible, false);
});

test("refundStatusBanner returns REFUNDED state with amount and cancellation reason", () => {
  const ref = refundStatusBanner(SAMPLE_ORDERS[2]);
  assert.equal(ref.state, "REFUNDED");
  assert.equal(ref.amountPaise, 30195);
  assert.equal(ref.reason, "Changed my mind");

  const proc = refundStatusBanner({
    status: "CANCELLED",
    totalPaise: 44790,
    timeline: [{ status: "CANCELLED", at: "2026-03-01T10:00:00Z", reason: "Ordered by mistake" }],
  });
  assert.equal(proc.state, "PROCESSING");
  assert.equal(proc.reason, "Ordered by mistake");

  assert.equal(refundStatusBanner(SAMPLE_ORDERS[0]).state, "NONE");
});

test("computeCustomerOrderStats and filterCustomerOrders segment orders accurately", () => {
  const stats = computeCustomerOrderStats(SAMPLE_ORDERS);
  assert.equal(stats.totalOrders, 3);
  assert.equal(stats.activeCount, 1);
  assert.equal(stats.deliveredCount, 1);
  assert.equal(stats.cancelledOrRefundedCount, 1);
  assert.equal(stats.refundedTotalPaise, 30195);

  assert.equal(filterCustomerOrders(SAMPLE_ORDERS, "ACTIVE", "").length, 1);
  assert.equal(filterCustomerOrders(SAMPLE_ORDERS, "DELIVERED", "").length, 1);
  assert.equal(filterCustomerOrders(SAMPLE_ORDERS, "REFUNDED", "").length, 1);
  assert.equal(filterCustomerOrders(SAMPLE_ORDERS, "ALL", "jackfruit").length, 1);
});

test("formatCancellationReason combines preset reason and optional note", () => {
  assert.equal(formatCancellationReason("Changed my mind", ""), "Changed my mind");
  assert.equal(formatCancellationReason("Other", "Need to change delivery address"), "Need to change delivery address");
  assert.equal(
    formatCancellationReason("Ordered by mistake", "Duplicate order"),
    "Ordered by mistake — Duplicate order",
  );
});
