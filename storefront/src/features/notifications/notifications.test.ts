import { describe, expect, it } from "vitest";
import { badgeLabel, notificationHref, timeAgo } from "./notifications";

const NOW = Date.parse("2026-10-30T12:00:00Z");
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

describe("timeAgo", () => {
  it("describes recent times", () => {
    expect(timeAgo(ago(5), NOW)).toBe("just now");
    expect(timeAgo(ago(5 * 60), NOW)).toBe("5m ago");
    expect(timeAgo(ago(3 * 3600), NOW)).toBe("3h ago");
    expect(timeAgo(ago(2 * 86400), NOW)).toBe("2d ago");
  });
  it("never shows a negative time for a clock that is slightly ahead", () => {
    expect(timeAgo(ago(-30), NOW)).toBe("just now");
  });
  it("uses a date after a week and tolerates garbage", () => {
    expect(timeAgo(ago(10 * 86400), NOW)).not.toMatch(/ago$/);
    expect(timeAgo("not a date", NOW)).toBe("");
  });
});

describe("badgeLabel", () => {
  it("hides at zero and caps at 9+", () => {
    expect(badgeLabel(0)).toBeNull();
    expect(badgeLabel(-1)).toBeNull();
    expect(badgeLabel(3)).toBe("3");
    expect(badgeLabel(9)).toBe("9");
    expect(badgeLabel(10)).toBe("9+");
  });
});

describe("notificationHref", () => {
  it("sends role-specific kinds to their area", () => {
    expect(notificationHref({ kind: "NEW_ORDER", orderId: "o1" })).toBe("/restaurant");
    expect(notificationHref({ kind: "NEW_JOB", orderId: "o1" })).toBe("/partner");
    expect(notificationHref({ kind: "JOB_ASSIGNED", orderId: "o1" })).toBe("/partner");
  });
  it("sends customer kinds to the order", () => {
    expect(notificationHref({ kind: "ORDER_PAID", orderId: "a/b" })).toBe("/orders/a%2Fb");
    expect(notificationHref({ kind: "REFUND_ISSUED", orderId: "o1" })).toBe("/orders/o1");
  });
  it("has no destination without an order", () => {
    expect(notificationHref({ kind: "ORDER_PAID", orderId: null })).toBeNull();
  });
});
