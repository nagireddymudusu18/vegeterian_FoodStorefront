import { describe, expect, it } from "vitest";
import { formatDistance, formatPaise } from "./money";

// Intl output uses a non-breaking space in some ICU versions; normalise.
const norm = (s: string) => s.replace(/ /g, " ");

describe("formatPaise", () => {
  it("formats rupees and paise", () => {
    expect(norm(formatPaise(12345))).toBe("₹123.45");
    expect(norm(formatPaise(5))).toBe("₹0.05");
    expect(norm(formatPaise(0))).toBe("₹0.00");
  });

  it("uses Indian digit grouping (lakh/crore)", () => {
    expect(norm(formatPaise(123456789))).toBe("₹12,34,567.89");
    expect(norm(formatPaise(10000000))).toBe("₹1,00,000.00");
  });

  it("is safe for non-finite input", () => {
    expect(norm(formatPaise(Number.NaN))).toBe("₹0.00");
  });
});

describe("formatDistance", () => {
  it("formats meters and kilometres", () => {
    expect(formatDistance(350)).toBe("350 m");
    expect(formatDistance(1234)).toBe("1.2 km");
    expect(formatDistance(undefined)).toBe("");
  });
});
