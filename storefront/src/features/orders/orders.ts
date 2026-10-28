export const LIFECYCLE = [
  "CREATED",
  "PAID",
  "MERCHANT_ACCEPTED",
  "PREPARING",
  "RIDER_ASSIGNED",
  "PICKED_UP",
  "DELIVERED",
] as const;

export const TERMINAL_FAILURE = ["CANCELLED", "PAYMENT_FAILED", "REJECTED", "MERCHANT_REJECTED", "REFUNDED", "FAILED", "EXPIRED"];

const LABELS: Record<string, string> = {
  CREATED: "Order placed",
  PAID: "Payment confirmed",
  MERCHANT_ACCEPTED: "Restaurant accepted",
  PREPARING: "Preparing",
  RIDER_ASSIGNED: "Rider assigned",
  PICKED_UP: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  PAYMENT_FAILED: "Payment failed",
  REJECTED: "Rejected by restaurant",
  MERCHANT_REJECTED: "Rejected by restaurant",
  REFUNDED: "Refunded",
  FAILED: "Failed",
  EXPIRED: "Expired",
};

export function statusLabel(status: string): string {
  return LABELS[status] ?? status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function isTerminal(status: string): boolean {
  return status === "DELIVERED" || TERMINAL_FAILURE.includes(status);
}

export function isFailure(status: string): boolean {
  return TERMINAL_FAILURE.includes(status);
}

/** The server has the final say; this only controls whether the button is shown. */
export function canCancel(status: string): boolean {
  return status === "CREATED" || status === "PAID" || status === "MERCHANT_ACCEPTED";
}

/** Index of the status in the happy path, or -1 when not part of it. */
export function lifecycleIndex(status: string): number {
  return (LIFECYCLE as readonly string[]).indexOf(status);
}

export type StepState = "done" | "current" | "upcoming";

export function stepState(status: string, step: string): StepState {
  const cur = lifecycleIndex(status);
  const idx = lifecycleIndex(step);
  if (cur === -1) return "upcoming";
  if (status === "DELIVERED") return "done";
  if (idx < cur) return "done";
  if (idx === cur) return "current";
  return "upcoming";
}
