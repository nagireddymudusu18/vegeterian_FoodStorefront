import type { Order } from "@/lib/api";
import { awaitsRefund, canCancel, isTerminal } from "./orders";

export type CustomerOrderFilterTab = "ALL" | "ACTIVE" | "DELIVERED" | "REFUNDED";

export const CANCELLATION_REASONS = [
  "Ordered by mistake",
  "Delivery time is too long",
  "Forgot to apply cooking instructions",
  "Changed my mind",
  "Other",
] as const;

export interface CancellationPolicyView {
  eligible: boolean;
  headline: string;
  detail: string;
}

export interface RefundBannerView {
  state: "NONE" | "PROCESSING" | "REFUNDED";
  headline: string;
  detail: string;
  amountPaise: number;
  reason?: string | null;
}

export interface CustomerOrderStats {
  totalOrders: number;
  activeCount: number;
  deliveredCount: number;
  cancelledOrRefundedCount: number;
  refundedTotalPaise: number;
}

export function cancellationPolicySummary(status: string): CancellationPolicyView {
  if (canCancel(status)) {
    return {
      eligible: true,
      headline: "Free cancellation window open",
      detail:
        "You can cancel this order with a 100% instant refund before the partner kitchen starts preparing your food.",
    };
  }
  if (status === "PREPARING" || status === "RIDER_ASSIGNED" || status === "PICKED_UP") {
    return {
      eligible: false,
      headline: "Cancellation window closed",
      detail:
        "The partner kitchen has already begun preparing or dispatching your food, so self-serve cancellation is locked.",
    };
  }
  return {
    eligible: false,
    headline: "Order completed or closed",
    detail: "This order has already reached a final state.",
  };
}

export function refundStatusBanner(order: Pick<Order, "status" | "totalPaise" | "cancellationReason" | "timeline">): RefundBannerView {
  const timelineReason =
    order.cancellationReason ??
    order.timeline?.find((e) => e.status === "CANCELLED" && e.reason)?.reason ??
    null;

  if (order.status === "REFUNDED") {
    return {
      state: "REFUNDED",
      headline: "Full refund issued to original payment method",
      detail:
        "Your refund has been processed automatically. UPI and wallet refunds reflect immediately; bank cards settle within 2–4 business days.",
      amountPaise: order.totalPaise,
      reason: timelineReason,
    };
  }

  if (awaitsRefund(order.status)) {
    return {
      state: "PROCESSING",
      headline: "Automatic refund in progress",
      detail:
        "This order was cancelled or declined by the kitchen. We have initiated a full refund to your original payment method.",
      amountPaise: order.totalPaise,
      reason: timelineReason,
    };
  }

  return {
    state: "NONE",
    headline: "",
    detail: "",
    amountPaise: 0,
    reason: timelineReason,
  };
}

export function computeCustomerOrderStats(list: Order[]): CustomerOrderStats {
  let activeCount = 0;
  let deliveredCount = 0;
  let cancelledOrRefundedCount = 0;
  let refundedTotalPaise = 0;

  for (const o of list) {
    if (!isTerminal(o.status)) {
      activeCount += 1;
    } else if (o.status === "DELIVERED") {
      deliveredCount += 1;
    } else if (
      o.status === "REFUNDED" ||
      o.status === "CANCELLED" ||
      o.status === "REJECTED" ||
      o.status === "MERCHANT_REJECTED"
    ) {
      cancelledOrRefundedCount += 1;
      if (o.status === "REFUNDED") {
        refundedTotalPaise += o.totalPaise || 0;
      }
    }
  }

  return {
    totalOrders: list.length,
    activeCount,
    deliveredCount,
    cancelledOrRefundedCount,
    refundedTotalPaise,
  };
}

export function filterCustomerOrders(
  list: Order[],
  tab: CustomerOrderFilterTab,
  query: string,
): Order[] {
  const q = query.trim().toLowerCase();

  return list.filter((o) => {
    if (tab === "ACTIVE" && isTerminal(o.status)) return false;
    if (tab === "DELIVERED" && o.status !== "DELIVERED") return false;
    if (
      tab === "REFUNDED" &&
      o.status !== "REFUNDED" &&
      o.status !== "CANCELLED" &&
      o.status !== "REJECTED" &&
      o.status !== "MERCHANT_REJECTED"
    ) {
      return false;
    }

    if (!q) return true;
    const itemNames = (o.items ?? []).map((it) => it.name ?? "").join(" ");
    const hay = `${o.orderNumber ?? ""} ${o.id} ${o.restaurantName ?? ""} ${o.deliveryAddress ?? ""} ${itemNames}`.toLowerCase();
    return hay.includes(q);
  });
}

export function formatCancellationReason(selectedReason: string, customNote?: string): string {
  const base = selectedReason.trim() || "Customer requested cancellation";
  const extra = customNote?.trim() ?? "";
  if (!extra) return base;
  return base === "Other" ? extra : `${base} — ${extra}`;
}
