import type { Diet, MenuItem, Restaurant } from "@/lib/api";

export type DietFilter = "ALL" | Diet;

export const DIET_OPTIONS: { value: DietFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PURE_VEG", label: "Pure Veg" },
  { value: "VEGAN", label: "Vegan" },
  { value: "JAIN", label: "Jain" },
];

export function isDietFilter(v: unknown): v is DietFilter {
  return v === "ALL" || v === "PURE_VEG" || v === "VEGAN" || v === "JAIN";
}

export function dietParam(d: DietFilter): Diet | null {
  return d === "ALL" ? null : d;
}

export function matchesDiet(item: Pick<MenuItem, "isPureVeg" | "isVegan" | "isJain">, d: DietFilter): boolean {
  switch (d) {
    case "ALL":
      return true;
    case "PURE_VEG":
      return item.isPureVeg;
    case "VEGAN":
      return item.isVegan;
    case "JAIN":
      return item.isJain;
  }
}

/** Accepts string[] | comma/semicolon separated string | null. */
export function toList(v: string[] | string | null | undefined): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
  return v
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type Tier = 1 | 2 | null;

/**
 * Tier 1 = exclusive-veg kitchen, Tier 2 = non-veg kitchen with segregated veg preparation.
 * Tolerates enum names such as TIER_1, LEVEL_1, EXCLUSIVE_VEG, 1, "2", SEGREGATED.
 */
export function certificationTier(level: Restaurant["kitchenCertificationLevel"]): Tier {
  if (level === null || level === undefined || level === "") return null;
  const s = String(level).toUpperCase();
  if (/EXCLUSIVE|PURE/.test(s)) return 1;
  if (/SEGREGAT|SHARED|MIXED/.test(s)) return 2;
  const m = s.match(/\d+/);
  if (m) {
    const n = Number(m[0]);
    if (n === 1) return 1;
    if (n === 2) return 2;
  }
  return null;
}
