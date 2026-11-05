import type { Diet, MenuItem, Restaurant } from "@/lib/api";

export type DietFilter = "ALL" | Diet;

export const DEFAULT_DIET: DietFilter = "PURE_VEG";

export const DIET_OPTIONS: { value: DietFilter; label: string }[] = [
  { value: "PURE_VEG", label: "Pure Veg" },
  { value: "VEGAN", label: "Vegan" },
  { value: "JAIN", label: "Jain" },
  { value: "ALL", label: "All" },
];

export function dietLabel(d: DietFilter): string {
  return DIET_OPTIONS.find((o) => o.value === d)?.label ?? "Pure Veg";
}

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

// ---------- Pure DietRules validator (mirrors catalog-service DietRules.java) ----------

const PLANT_QUALIFIERS = new Set([
  "coconut", "almond", "soy", "soya", "oat", "rice", "cashew", "peanut", "cocoa", "shea",
  "plant", "vegan", "nut", "hazelnut", "pistachio",
]);

const NEXT_WORD_EXEMPTIONS = new Set(["bean", "beans", "squash", "lettuce"]);

const NON_VEG_TERMS = [
  "meat", "chicken", "mutton", "lamb", "pork", "beef", "bacon", "ham", "fish", "prawn", "shrimp",
  "crab", "lobster", "squid", "tuna", "salmon", "anchovy", "anchovies", "sausage", "lard", "tallow",
  "egg", "gelatin", "gelatine", "carmine", "cochineal", "rennet", "bone char",
];

const ANIMAL_DERIVED_NON_VEGAN_TERMS = [
  "milk", "cream", "butter", "ghee", "cheese", "paneer", "curd", "yogurt", "yoghurt", "dahi",
  "khoya", "mawa", "whey", "casein", "lactose", "buttermilk", "honey",
];

const JAIN_FORBIDDEN_TERMS = [
  "onion", "garlic", "potato", "carrot", "radish", "beet", "beetroot", "ginger", "turnip",
  "mushroom", "yam", "shallot", "leek", "scallion",
];

function tokenizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

function wordMatches(word: string, term: string): boolean {
  return word === term || word === `${term}s` || word === `${term}es`;
}

function containsTerm(words: string[], termWords: string[], plantQualifierExempt: boolean): boolean {
  for (let i = 0; i + termWords.length <= words.length; i++) {
    let match = true;
    for (let j = 0; j < termWords.length; j++) {
      if (!wordMatches(words[i + j], termWords[j])) {
        match = false;
        break;
      }
    }
    if (!match) continue;
    if (plantQualifierExempt) {
      if (i > 0 && PLANT_QUALIFIERS.has(words[i - 1])) continue;
      const next = i + termWords.length;
      if (next < words.length && NEXT_WORD_EXEMPTIONS.has(words[next])) continue;
    }
    return true;
  }
  return false;
}

function collectViolations(
  out: string[],
  ingredients: string[],
  terms: string[],
  dietLabelName: string,
  plantQualifierExempt: boolean,
) {
  for (const ingredient of ingredients) {
    if (!ingredient) continue;
    const words = tokenizeWords(ingredient);
    for (const label of terms) {
      const termWords = tokenizeWords(label);
      if (containsTerm(words, termWords, plantQualifierExempt)) {
        out.push(`ingredient '${ingredient.trim()}' (${label}) is not permitted in a ${dietLabelName} item`);
        break;
      }
    }
  }
}

/**
 * Returns all dietary rule violations for a menu item (empty array when valid).
 * Matches `in.foodapp.catalog.domain.DietRules#findViolations`.
 */
export function findDietViolations(
  pureVeg: boolean,
  vegan: boolean,
  jain: boolean,
  ingredients: string[] | null | undefined,
): string[] {
  const violations: string[] = [];
  if (vegan && !pureVeg) {
    violations.push("a vegan item must also be marked pure-veg");
  }
  if (jain && !pureVeg) {
    violations.push("a Jain item must also be marked pure-veg");
  }
  const items = ingredients ?? [];
  if (pureVeg || vegan || jain) {
    collectViolations(violations, items, NON_VEG_TERMS, "pure-veg", false);
  }
  if (vegan) {
    collectViolations(violations, items, ANIMAL_DERIVED_NON_VEGAN_TERMS, "vegan", true);
  }
  if (jain) {
    collectViolations(violations, items, JAIN_FORBIDDEN_TERMS, "Jain", false);
  }
  return violations;
}
