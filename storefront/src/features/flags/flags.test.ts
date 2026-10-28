import { describe, expect, it } from "vitest";
import { isOn } from "./flags-context";

describe("isOn", () => {
  it("uses the server value when present", () => {
    expect(isOn({ guest_checkout: false }, "guest_checkout")).toBe(false);
    expect(isOn({ delivery_module: true }, "delivery_module")).toBe(true);
  });

  it("defaults features to on, except the delivery module", () => {
    expect(isOn({}, "guest_checkout")).toBe(true);
    expect(isOn({}, "delivery_module")).toBe(false);
  });
});
