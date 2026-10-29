import { describe, expect, it } from "vitest";
import { ApiError, errorReference, newRequestId } from "./api";

describe("newRequestId", () => {
  it("makes ids the services accept and never repeats", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const id = newRequestId();
      expect(id).toMatch(/^[A-Za-z0-9._-]{8,64}$/);
      ids.add(id);
    }
    expect(ids.size).toBe(50);
  });
});

describe("errorReference", () => {
  it("returns the request id for server failures only", () => {
    expect(errorReference(new ApiError(500, "Internal Server Error", undefined, "abc-12345678"))).toBe("abc-12345678");
    expect(errorReference(new ApiError(503, "Unavailable", "try later", "abc-12345678"))).toBe("abc-12345678");
    expect(errorReference(new ApiError(404, "Not Found", undefined, "abc-12345678"))).toBeUndefined();
    expect(errorReference(new ApiError(400, "Bad Request", undefined, "abc-12345678"))).toBeUndefined();
  });
  it("copes with errors that carry no id and with other values", () => {
    expect(errorReference(new ApiError(500, "Internal Server Error"))).toBeUndefined();
    expect(errorReference(new Error("x"))).toBeUndefined();
    expect(errorReference(null)).toBeUndefined();
  });
});
