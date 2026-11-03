import { describe, expect, it } from "vitest";
import { indexingEnabled, jsonLd, siteUrl } from "./seo";

describe("siteUrl", () => {
  it("defaults to the brand domain", () => {
    expect(siteUrl({})).toBe("https://veggoeats.in");
  });

  it("uses NEXT_PUBLIC_SITE_URL without a trailing slash", () => {
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "https://34-47-166-37.sslip.io/" })).toBe("https://34-47-166-37.sslip.io");
  });
});

describe("indexingEnabled", () => {
  it("is off unless explicitly enabled", () => {
    expect(indexingEnabled({})).toBe(false);
    expect(indexingEnabled({ NEXT_PUBLIC_ALLOW_INDEXING: "yes" })).toBe(false);
    expect(indexingEnabled({ NEXT_PUBLIC_ALLOW_INDEXING: "true" })).toBe(true);
  });
});

describe("jsonLd", () => {
  it("escapes angle brackets so data cannot close the script tag", () => {
    const out = jsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("<");
    expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script>");
  });
});
