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

export const KITCHEN_SLA_WARN_MINUTES = 10;
export const KITCHEN_SLA_OVERDUE_MINUTES = 20;

export interface OrderSlaInfo {
  elapsedSeconds: number;
  elapsedMinutes: number;
  elapsedLabel: string;
  elapsedClock: string;
  progressPercent: number;
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

/**
 * Formats an elapsed duration in seconds into a crisp, fixed-width kitchen clock string:
 * - Under 60 minutes: `MM:SS` (e.g. `06:14`, `14:09`)
 * - 60 minutes or more: `Xh YYm` (e.g. `1h 05m`, `2h 18m`)
 */
export function formatElapsedClock(elapsedSeconds: number): string {
  const safeSeconds = Number.isFinite(elapsedSeconds) ? Math.max(0, Math.floor(elapsedSeconds)) : 0;
  const totalMinutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const remMinutes = totalMinutes % 60;
    return `${hours}h ${String(remMinutes).padStart(2, "0")}m`;
  }

  return `${String(totalMinutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Formats a createdAt ISO timestamp into a concise local clock time (e.g. `07:54 PM`) or null if invalid. */
export function formatOrderPlacedTime(createdAtIso: string): string | null {
  const ms = Date.parse(createdAtIso);
  if (!Number.isFinite(ms)) return null;
  try {
    return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return null;
  }
}

/** Computes live elapsed time, visual progress, and SLA urgency from an order's `createdAt` timestamp. */
export function computeOrderSla(createdAtIso: string, nowMs = Date.now()): OrderSlaInfo {
  const createdMs = Date.parse(createdAtIso);
  if (!Number.isFinite(createdMs)) {
    return {
      elapsedSeconds: 0,
      elapsedMinutes: 0,
      elapsedLabel: "Just now",
      elapsedClock: "00:00",
      progressPercent: 0,
      urgency: "ON_TIME",
      badgeLabel: "On time",
    };
  }

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - createdMs) / 1000));
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  const elapsedClock = formatElapsedClock(elapsedSeconds);
  const elapsedLabel =
    elapsedMinutes <= 0
      ? "Just now"
      : elapsedMinutes >= 60
        ? `${Math.floor(elapsedMinutes / 60)}h ${elapsedMinutes % 60}m ago`
        : `${elapsedMinutes}m ago`;

  const targetSeconds = KITCHEN_SLA_OVERDUE_MINUTES * 60;
  const progressPercent = Math.min(100, Math.round((elapsedSeconds / targetSeconds) * 100));

  if (elapsedMinutes >= KITCHEN_SLA_OVERDUE_MINUTES) {
    return {
      elapsedSeconds,
      elapsedMinutes,
      elapsedLabel,
      elapsedClock,
      progressPercent,
      urgency: "OVERDUE",
      badgeLabel: "SLA Overdue",
    };
  }
  if (elapsedMinutes >= KITCHEN_SLA_WARN_MINUTES) {
    return {
      elapsedSeconds,
      elapsedMinutes,
      elapsedLabel,
      elapsedClock,
      progressPercent,
      urgency: "AT_RISK",
      badgeLabel: "Prep SLA Due",
    };
  }
  return {
    elapsedSeconds,
    elapsedMinutes,
    elapsedLabel,
    elapsedClock,
    progressPercent,
    urgency: "ON_TIME",
    badgeLabel: "On time",
  };
}
