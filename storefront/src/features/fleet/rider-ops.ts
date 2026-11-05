import type { Delivery, DeliveryStatus } from "@/lib/api";

export const MAX_ACTIVE_DELIVERIES = 2;
export const DEFAULT_TRIP_PAYOUT_PAISE = 4500;

export interface RiderShiftSummary {
  activeCount: number;
  assignedCount: number;
  pickedUpCount: number;
  completedCount: number;
  cancelledCount: number;
  completedEarningsPaise: number;
  activePotentialPaise: number;
  atCapacity: boolean;
}

export interface RiderStepInfo {
  stepNumber: 1 | 2 | 3;
  headline: string;
  instruction: string;
}

/** Returns the estimated rider payout in paise for a delivery job. */
export function estimateDeliveryPayoutPaise(d: Pick<Delivery, "payoutPaise">): number {
  const raw = d.payoutPaise;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.round(raw);
  }
  return DEFAULT_TRIP_PAYOUT_PAISE;
}

/** Summarizes a rider's active deliveries and completed trip history into shift KPIs. */
export function summarizeRiderShift(
  active: readonly Delivery[],
  history: readonly Delivery[],
): RiderShiftSummary {
  let assignedCount = 0;
  let pickedUpCount = 0;
  let activePotentialPaise = 0;

  for (const d of active) {
    if (d.status === "ASSIGNED") assignedCount++;
    else if (d.status === "PICKED_UP") pickedUpCount++;
    activePotentialPaise += estimateDeliveryPayoutPaise(d);
  }

  let completedCount = 0;
  let cancelledCount = 0;
  let completedEarningsPaise = 0;

  for (const d of history) {
    if (d.status === "DELIVERED") {
      completedCount++;
      completedEarningsPaise += estimateDeliveryPayoutPaise(d);
    } else if (d.status === "CANCELLED") {
      cancelledCount++;
    }
  }

  return {
    activeCount: active.length,
    assignedCount,
    pickedUpCount,
    completedCount,
    cancelledCount,
    completedEarningsPaise,
    activePotentialPaise,
    atCapacity: active.length >= MAX_ACTIVE_DELIVERIES,
  };
}

/** Resolves the step-by-step fulfillment instruction for a delivery status. */
export function resolveRiderStep(status: DeliveryStatus): RiderStepInfo {
  switch (status) {
    case "ASSIGNED":
      return {
        stepNumber: 1,
        headline: "Step 1 of 2 · Head to restaurant & pick up order",
        instruction: "Show the order number at the kitchen counter, verify sealed Pure-Veg packaging, and tap Picked up.",
      };
    case "PICKED_UP":
      return {
        stepNumber: 2,
        headline: "Step 2 of 2 · Out for delivery — verify Customer OTP",
        instruction: "Navigate to the customer's drop-off address and enter their 4-digit delivery OTP to complete handoff.",
      };
    default:
      return {
        stepNumber: 3,
        headline: "Completed",
        instruction: "Delivery handoff verified.",
      };
  }
}

/** Filters a list of deliveries by order number, restaurant name, or drop-off address. */
export function filterRiderDeliveries(
  deliveries: readonly Delivery[],
  query: string,
): Delivery[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...deliveries];
  return deliveries.filter((d) => {
    const hay = `${d.orderNumber} ${d.restaurantName ?? ""} ${d.deliveryAddress ?? ""}`.toLowerCase();
    return hay.includes(q);
  });
}
