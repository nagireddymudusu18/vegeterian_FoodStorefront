import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";
import { PUBLIC_PATHS, siteUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const lastModified = new Date(BRAND.updated);
  return PUBLIC_PATHS.map((path) => ({
    url: path === "/" ? base : `${base}${path}`,
    lastModified: Number.isNaN(lastModified.getTime()) ? undefined : lastModified,
    changeFrequency: path === "/" ? "daily" : "yearly",
    priority: path === "/" ? 1 : 0.3,
  }));
}
