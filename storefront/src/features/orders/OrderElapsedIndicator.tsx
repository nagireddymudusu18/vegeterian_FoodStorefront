"use client";

import { Clock } from "lucide-react";
import { computeOrderSla, formatOrderPlacedTime } from "./kitchen-ops";

export interface OrderElapsedIndicatorProps {
  /** ISO timestamp when the order was created (`order.createdAt`). */
  createdAt: string;
  /** Human-readable current ticket state (e.g. "New order", "Preparing"). */
  statusLabel: string;
  /** Current epoch milliseconds from a shared ticking clock. */
  nowMs: number;
}

/**
 * Visual Time Elapsed indicator for active kitchen order tickets.
 * Uses `createdAt` to render a live tabular-nums elapsed timer, current-state context,
 * urgency label, and a 20-minute SLA progress gauge.
 */
export function OrderElapsedIndicator({
  createdAt,
  statusLabel,
  nowMs,
}: OrderElapsedIndicatorProps) {
  const sla = computeOrderSla(createdAt, nowMs);
  const placedAt = formatOrderPlacedTime(createdAt);

  const tone =
    sla.urgency === "OVERDUE"
      ? {
          box: "border-red-300 bg-red-50/90",
          icon: "text-red-700",
          title: "text-red-950",
          subtext: "text-red-800/80",
          clock: "text-red-900",
          statusText: "text-red-800",
          track: "bg-red-200/70",
          fill: "bg-red-600",
        }
      : sla.urgency === "AT_RISK"
        ? {
            box: "border-amber-300 bg-amber-50/85",
            icon: "text-amber-700",
            title: "text-amber-950",
            subtext: "text-amber-900/80",
            clock: "text-amber-950",
            statusText: "text-amber-900",
            track: "bg-amber-200/70",
            fill: "bg-amber-600",
          }
        : {
            box: "border-emerald-200 bg-emerald-50/70",
            icon: "text-emerald-700",
            title: "text-emerald-950",
            subtext: "text-emerald-900/75",
            clock: "text-emerald-950",
            statusText: "text-emerald-800",
            track: "bg-emerald-200/70",
            fill: "bg-emerald-600",
          };

  return (
    <div
      data-testid="order-elapsed-indicator"
      data-urgency={sla.urgency}
      className={`rounded-xl border px-3.5 py-2.5 ${tone.box}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <Clock aria-hidden="true" className={`h-4 w-4 shrink-0 ${tone.icon}`} />
          <div className="flex flex-wrap items-baseline gap-x-1.5 text-xs">
            <span className={`font-bold ${tone.title}`}>Time elapsed</span>
            <span aria-hidden="true" className={tone.subtext}>
              ·
            </span>
            <span className={`font-medium ${tone.subtext}`}>
              {statusLabel}
              {placedAt ? ` since ${placedAt}` : ""}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-baseline gap-2">
          <span
            aria-label={`Time elapsed ${sla.elapsedClock}`}
            className={`font-mono text-sm font-extrabold tracking-tight tabular-nums ${tone.clock}`}
          >
            {sla.elapsedClock}
          </span>
          <span aria-hidden="true" className={`text-xs ${tone.subtext}`}>
            ·
          </span>
          <span className={`text-xs font-bold ${tone.statusText}`}>{sla.badgeLabel}</span>
        </div>
      </div>

      <div className="mt-2">
        <div
          role="progressbar"
          aria-label={`Time elapsed for order in ${statusLabel}: ${sla.elapsedClock} (${sla.badgeLabel})`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={sla.progressPercent}
          className={`relative h-1.5 w-full overflow-hidden rounded-full ${tone.track}`}
        >
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${tone.fill}`}
            style={{ width: `${Math.max(4, sla.progressPercent)}%` }}
          />
          <span
            aria-hidden="true"
            title="10 min prep check"
            className="absolute inset-y-0 left-1/2 w-px bg-white/80"
          />
        </div>
      </div>
    </div>
  );
}
