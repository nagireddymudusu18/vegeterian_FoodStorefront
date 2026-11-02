import { isFailure, statusLabel } from "./orders";

/** Colour-coded order status: green when delivered, red when failed or closed, turmeric while in progress. */
export function StatusPill({ status }: { status: string }) {
  const tone = isFailure(status)
    ? "bg-red-50 text-red-800 ring-red-200"
    : status === "DELIVERED"
      ? "bg-green-100 text-green-800 ring-green-200"
      : "bg-amber-100 text-amber-900 ring-amber-200";
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${tone}`}>{statusLabel(status)}</span>;
}
