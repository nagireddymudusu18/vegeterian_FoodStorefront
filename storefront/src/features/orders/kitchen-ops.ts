import type { StaffOrder } from "@/lib/api";

export type KitchenQueueStage = "ALL" | "NEW" | "ACCEPTED" | "PREPARING" | "DISPATCH";

export interface KitchenBoardSummary {
  totalCount: number;
  newCount: number;
  acceptedCount: number;
  preparingCount: number;
  dispatchCount: number;
  totalRevenuePaise: number;
  totalItemsCount: number;
}

export type SlaUrgency = "ON_TIME" | "AT_RISK" | "OVERDUE";

export interface OrderSlaInfo {
  elapsedMinutes: number;
  elapsedLabel: string;
  urgency: SlaUrgency;
  badgeLabel: string;
}

/** Maps a raw order status into one of the Kitchen Display System (KDS) queue stages. */
export function resolveKitchenStage(status: string): Exclude<KitchenQueueStage, "ALL"> {
  switch (status) {
    case "PAID":
      return "NEW";
    case "MERCHANT_ACCEPTED":
      return "ACCEPTED";
    case "PREPARING":
      return "PREPARING";
    default:
      return "DISPATCH";
  }
}

/** Computes summary KPI metrics across a list of kitchen orders. */
export function summarizeKitchenBoard(orders: readonly StaffOrder[]): KitchenBoardSummary {
  let newCount = 0;
  let acceptedCount = 0;
  let preparingCount = 0;
  let dispatchCount = 0;
  let totalRevenuePaise = 0;
  let totalItemsCount = 0;

  for (const o of orders) {
    const stage = resolveKitchenStage(o.status);
    if (stage === "NEW") newCount++;
    else if (stage === "ACCEPTED") acceptedCount++;
    else if (stage === "PREPARING") preparingCount++;
    else dispatchCount++;

    totalRevenuePaise += o.totalPaise ?? 0;
    for (const item of o.items ?? []) {
      totalItemsCount += item.quantity ?? 0;
    }
  }

  return {
    totalCount: orders.length,
    newCount,
    acceptedCount,
    preparingCount,
    dispatchCount,
    totalRevenuePaise,
    totalItemsCount,
  };
}

/** Filters kitchen orders by outlet name, queue stage, and text query (order number, dish name, or kitchen note). */
export function filterKitchenOrders(
  orders: readonly StaffOrder[],
  filter: {
    restaurantName?: string | null;
    stage?: KitchenQueueStage;
    query?: string;
  },
): StaffOrder[] {
  const outlet = filter.restaurantName?.trim() || "";
  const stage = filter.stage ?? "ALL";
  const q = filter.query?.trim().toLowerCase() || "";

  return orders.filter((o) => {
    if (outlet && outlet !== "ALL" && o.restaurantName !== outlet) {
      return false;
    }
    if (stage !== "ALL" && resolveKitchenStage(o.status) !== stage) {
      return false;
    }
    if (q) {
      const hay = [
        o.orderNumber,
        o.restaurantName ?? "",
        o.cookingInstructions ?? "",
        ...(o.items ?? []).map((i) => i.name),
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Computes elapsed time and SLA urgency for an active kitchen order. */
export function computeOrderSla(createdAtIso: string, nowMs = Date.now()): OrderSlaInfo {
  const createdMs = Date.parse(createdAtIso);
  if (!Number.isFinite(createdMs)) {
    return {
      elapsedMinutes: 0,
      elapsedLabel: "Just now",
      urgency: "ON_TIME",
      badgeLabel: "On time",
    };
  }
  const elapsedMinutes = Math.max(0, Math.floor((nowMs - createdMs) / 60_000));
  const elapsedLabel = elapsedMinutes <= 0 ? "Just now" : `${elapsedMinutes}m ago`;

  if (elapsedMinutes >= 20) {
    return {
      elapsedMinutes,
      elapsedLabel,
      urgency: "OVERDUE",
      badgeLabel: "SLA Overdue",
    };
  }
  if (elapsedMinutes >= 10) {
    return {
      elapsedMinutes,
      elapsedLabel,
      urgency: "AT_RISK",
      badgeLabel: "Prep SLA Due",
    };
  }
  return {
    elapsedMinutes,
    elapsedLabel,
    urgency: "ON_TIME",
    badgeLabel: "On time",
  };
}
