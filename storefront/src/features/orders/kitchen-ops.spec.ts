import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeOrderSla,
  formatElapsedClock,
  formatOrderPlacedTime,
} from "./kitchen-ops";

describe("Kitchen ticket Time Elapsed indicator logic (node:test)", () => {
  it("formats elapsed seconds into MM:SS and hour-rollover clock labels", () => {
    assert.equal(formatElapsedClock(0), "00:00");
    assert.equal(formatElapsedClock(-5), "00:00");
    assert.equal(formatElapsedClock(9), "00:09");
    assert.equal(formatElapsedClock(614), "10:14");
    assert.equal(formatElapsedClock(3660), "1h 01m");
  });

  it("calculates urgency tiers and 20-minute SLA progress percent from createdAt", () => {
    const now = Date.parse("2026-11-24T20:00:00.000Z");

    const fresh = computeOrderSla("2026-11-24T19:54:00.000Z", now);
    assert.equal(fresh.urgency, "ON_TIME");
    assert.equal(fresh.elapsedMinutes, 6);
    assert.equal(fresh.elapsedClock, "06:00");
    assert.equal(fresh.progressPercent, 30);

    const aging = computeOrderSla("2026-11-24T19:46:00.000Z", now);
    assert.equal(aging.urgency, "AT_RISK");
    assert.equal(aging.elapsedMinutes, 14);
    assert.equal(aging.elapsedClock, "14:00");
    assert.equal(aging.progressPercent, 70);

    const overdue = computeOrderSla("2026-11-24T19:35:00.000Z", now);
    assert.equal(overdue.urgency, "OVERDUE");
    assert.equal(overdue.elapsedMinutes, 25);
    assert.equal(overdue.elapsedClock, "25:00");
    assert.equal(overdue.progressPercent, 100);

    // Future createdAt timestamp clamps cleanly to 00:00
    const future = computeOrderSla("2026-11-24T20:05:00.000Z", now);
    assert.equal(future.elapsedSeconds, 0);
    assert.equal(future.elapsedClock, "00:00");
    assert.equal(future.progressPercent, 0);

    assert.equal(formatOrderPlacedTime("invalid"), null);
    assert.ok(formatOrderPlacedTime("2026-11-24T19:54:00.000Z"));
  });
});
