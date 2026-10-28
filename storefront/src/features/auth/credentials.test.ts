import { describe, expect, it } from "vitest";
import { passwordProblem, validateEmail } from "./credentials";

describe("validateEmail", () => {
  it("accepts ordinary addresses", () => {
    expect(validateEmail("asha@example.com")).toBe(true);
    expect(validateEmail("  asha.rao+food@mail.example.in ")).toBe(true);
  });
  it("rejects malformed addresses", () => {
    for (const bad of ["", "asha", "asha@", "@example.com", "a b@example.com", "asha@example", "a@@example.com"]) {
      expect(validateEmail(bad)).toBe(false);
    }
  });
});

describe("passwordProblem", () => {
  it("accepts a letter+digit password of 8+ characters", () => {
    expect(passwordProblem("Sup3rSecret")).toBeNull();
  });
  it("rejects short, letter-only, digit-only and over-long passwords", () => {
    expect(passwordProblem("a1")).not.toBeNull();
    expect(passwordProblem("onlyletters")).not.toBeNull();
    expect(passwordProblem("123456789")).not.toBeNull();
    expect(passwordProblem("a1".repeat(40))).not.toBeNull();
  });
});
