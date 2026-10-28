const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats integer paise as INR, e.g. 123456 -> "₹1,234.56". */
export function formatPaise(paise: number): string {
  const safe = Number.isFinite(paise) ? Math.round(paise) : 0;
  return inr.format(safe / 100);
}

/** Formats a distance in meters as "350 m" or "1.2 km". */
export function formatDistance(meters: number | undefined | null): string {
  if (meters == null || !Number.isFinite(meters)) return "";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
