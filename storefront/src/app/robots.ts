import type { MetadataRoute } from "next";
import { PRIVATE_PREFIXES, indexingEnabled, siteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  if (!indexingEnabled()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: PRIVATE_PREFIXES.flatMap((p) => [`${p}/`, `${p}$`]) },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
