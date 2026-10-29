import { describe, expect, it } from "vitest";
import { safeInternalPath } from "./redirect";

describe("safeInternalPath", () => {
  it("keeps ordinary same-site paths, queries and fragments", () => {
    expect(safeInternalPath("/orders/123")).toBe("/orders/123");
    expect(safeInternalPath("/checkout?step=2#pay")).toBe("/checkout?step=2#pay");
    expect(safeInternalPath("/")).toBe("/");
  });

  it("rejects anything that could leave the site", () => {
    const bad = [
      "//evil.com",
      "///evil.com",
      "/\\evil.com",
      "/\\/evil.com",
      "\\\\evil.com",
      "/\t/evil.com",
      "/\n/evil.com",
      "/\r/evil.com",
      "/\u0000/evil.com",
      "https://evil.com",
      "javascript:alert(1)",
      "evil.com",
      "",
    ];
    for (const b of bad) expect(safeInternalPath(b)).toBe("/");
  });

  it("uses the given fallback and accepts null or undefined", () => {
    expect(safeInternalPath(null, "/home")).toBe("/home");
    expect(safeInternalPath(undefined)).toBe("/");
    expect(safeInternalPath("//evil.com", "/home")).toBe("/home");
  });

  it("treats percent-encoded slashes as plain path text", () => {
    expect(safeInternalPath("/%5Cevil.com")).toBe("/%5Cevil.com");
  });
});
