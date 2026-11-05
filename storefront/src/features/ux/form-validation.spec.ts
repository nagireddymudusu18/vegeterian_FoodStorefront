import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluatePasswordStrength,
  validateIndianMobileInput,
  validateOrderNumberInput,
  resolveCheckoutProgressState,
} from "./form-validation";

describe("form-validation & UX helpers", () => {
  describe("evaluatePasswordStrength", () => {
    it("identifies empty and short passwords", () => {
      const empty = evaluatePasswordStrength("");
      assert.equal(empty.score, 0);
      assert.equal(empty.valid, false);

      const short = evaluatePasswordStrength("abc12");
      assert.equal(short.score, 1);
      assert.equal(short.label, "Too short");
      assert.equal(short.valid, false);
    });

    it("validates 8+ chars with letters and numbers and scores strength", () => {
      const fair = evaluatePasswordStrength("rasoi123");
      assert.equal(fair.valid, true);
      assert.equal(fair.score, 2);
      assert.equal(fair.label, "Fair");

      const good = evaluatePasswordStrength("RasoiKitchen1");
      assert.equal(good.valid, true);
      assert.equal(good.score, 3);
      assert.equal(good.label, "Good");

      const strong = evaluatePasswordStrength("RasoiKitchen#2025");
      assert.equal(strong.valid, true);
      assert.equal(strong.score, 4);
      assert.equal(strong.label, "Strong");
    });
  });

  describe("validateIndianMobileInput", () => {
    it("formats 10-digit Indian mobile numbers and strips +91 prefix", () => {
      const res = validateIndianMobileInput("+91 98765-43210");
      assert.equal(res.digits, "9876543210");
      assert.equal(res.formatted, "98765 43210");
      assert.equal(res.e164, "+919876543210");
      assert.equal(res.valid, true);
    });

    it("rejects numbers not starting with 6-9 or incomplete numbers", () => {
      const badStart = validateIndianMobileInput("5123456789");
      assert.equal(badStart.valid, false);
      assert.ok(badStart.hint?.includes("6, 7, 8, or 9"));

      const partial = validateIndianMobileInput("987654");
      assert.equal(partial.valid, false);
      assert.equal(partial.formatted, "98765 4");
      assert.ok(partial.hint?.includes("4 more digits"));
    });
  });

  describe("validateOrderNumberInput", () => {
    it("auto-formats valid Crockford Base32 order codes into FA-XXXXX-XXXXX", () => {
      const valid = validateOrderNumberInput("7k2m9p4x8q");
      assert.equal(valid.formattedInput, "FA-7K2M9-P4X8Q");
      assert.equal(valid.normalizedCode, "7K2M9P4X8Q");
      assert.equal(valid.valid, true);
    });

    it("flags excluded Crockford characters (I, L, O, U) and partial inputs", () => {
      const partial = validateOrderNumberInput("FA-7K2M9");
      assert.equal(partial.valid, false);
      assert.equal(partial.formattedInput, "FA-7K2M9");

      const excludedChar = validateOrderNumberInput("7K2M9P4X8O");
      assert.equal(excludedChar.valid, false);
      assert.ok(excludedChar.hint?.includes("I, L, O, and U"));
    });
  });

  describe("resolveCheckoutProgressState", () => {
    it("returns multi-step progress state for creating and paying phases", () => {
      const idle = resolveCheckoutProgressState("idle");
      assert.equal(idle.active, false);

      const creating = resolveCheckoutProgressState("creating");
      assert.equal(creating.active, true);
      assert.equal(creating.percent, 45);
      assert.equal(creating.steps.length, 3);
      assert.equal(creating.steps[1].status, "active");

      const paying = resolveCheckoutProgressState("paying");
      assert.equal(paying.active, true);
      assert.equal(paying.percent, 85);
      assert.equal(paying.steps[2].status, "active");
    });
  });
});
