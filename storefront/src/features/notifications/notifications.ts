import type { AppNotification } from "@/lib/api";

/** "3m ago" style label; falls back to a date for anything older than a week. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString("en-IN");
}

/** Text for the bell badge: hidden at zero, capped at 9+. */
export function badgeLabel(unread: number): string | null {
  if (unread <= 0) return null;
  return unread > 9 ? "9+" : String(unread);
}

/** Where tapping a notification should go; null when it has no destination. */
export function notificationHref(n: Pick<AppNotification, "kind" | "orderId">): string | null {
  switch (n.kind) {
    case "NEW_ORDER":
      return "/restaurant";
    case "NEW_JOB":
    case "JOB_ASSIGNED":
      return "/partner";
    default:
      return n.orderId ? `/orders/${encodeURIComponent(n.orderId)}` : null;
  }
}
