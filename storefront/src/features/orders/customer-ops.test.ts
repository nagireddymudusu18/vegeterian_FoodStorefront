import { describe, expect, it } from "vitest";
import type { Order } from "@/lib/api";
import {
  cancellationPolicySummary,
  computeCustomerOrderStats,
  filterCustomerOrders,
  formatCancellationReason,
  refundStatusBanner,
} from "./customer-ops";

const ORDERS: Order[] = [
  {
    id: "o1",
    orderNumber: "FA-7K2M9-P4X8Q",
    restaurantName: "Saffron Pure Veg Bhavan",
    status: "PAID",
    subtotalPaise: 39800,
    taxPaise: 1990,
    deliveryFeePaise: 3000,
    totalPaise: 44790,
  },
  {
    id: "o2",
    orderNumber: "FA-9B4C7-M5T2H",
    restaurantName: "Jain Rasoi",
    status: "REFUNDED",
    subtotalPaise: 29800,
    taxPaise: 1490,
    deliveryFeePaise: 3000,
    totalPaise: 34290,
    cancellationReason: "Ordered by mistake",
  },
];

describe("customer-ops", () => {
  it("evaluates cancellation policy window and refund banner", () => {
    expect(cancellationPolicySummary("PAID").eligible).toBe(true);
    expect(cancellationPolicySummary("PREPARING").eligible).toBe(false);
    const banner = refundStatusBanner(ORDERS[1]);
    expect(banner.state).toBe("REFUNDED");
    expect(banner.amountPaise).toBe(34290);
    expect(banner.reason).toBe("Ordered by mistake");
  });

  it("computes stats, filters orders, and formats cancellation reason", () => {
    const stats = computeCustomerOrderStats(ORDERS);
    expect(stats.activeCount).toBe(1);
    expect(stats.refundedTotalPaise).toBe(34290);
    expect(filterCustomerOrders(ORDERS, "REFUNDED", "").length).toBe(1);
    expect(formatCancellationReason("Changed my mind", "Switching kitchen")).toBe(
      "Changed my mind — Switching kitchen",
    );
  });
});
