import type { MenuItem } from "@/lib/api";
import { toList } from "./diet";

export type AllergenKey =
  | "milk"
  | "nuts"
  | "peanuts"
  | "gluten"
  | "soy"
  | "sesame"
  | "onion_garlic";

export interface AllergenOption {
  key: AllergenKey;
  label: string;
  hint: string;
  terms: string[];
}

export const ALLERGEN_CATALOG: AllergenOption[] = [
  {
    key: "milk",
    label: "Milk & Dairy",
    hint: "Milk, paneer, ghee, butter, curd, cream, whey",
    terms: ["milk", "dairy", "paneer", "ghee", "butter", "curd", "yogurt", "yoghurt", "cream", "cheese", "khoya", "whey"],
  },
  {
    key: "nuts",
    label: "Tree Nuts",
    hint: "Cashew, almond, pistachio, walnut, hazelnut",
    terms: ["nuts", "nut", "tree nut", "tree nuts", "cashew", "cashews", "almond", "almonds", "pistachio", "walnut", "hazelnut"],
  },
  {
    key: "peanuts",
    label: "Peanuts",
    hint: "Groundnut, peanut oil, roasted peanuts",
    terms: ["peanut", "peanuts", "groundnut", "groundnuts"],
  },
  {
    key: "gluten",
    label: "Gluten & Wheat",
    hint: "Wheat flour, maida, atta, rava, semolina, barley",
    terms: ["gluten", "wheat", "maida", "atta", "semolina", "sooji", "rava", "barley", "rye"],
  },
  {
    key: "soy",
    label: "Soy & Soya",
    hint: "Soybean, tofu, soy sauce, soya chunks",
    terms: ["soy", "soya", "tofu", "soybean", "edamame"],
  },
  {
    key: "sesame",
    label: "Sesame (Til)",
    hint: "Sesame seeds, tahini, gingelly oil",
    terms: ["sesame", "til", "tahini", "gingelly"],
  },
  {
    key: "onion_garlic",
    label: "No Onion / Garlic",
    hint: "Flags onion, garlic, shallot, leek, and scallion",
    terms: ["onion", "onions", "garlic", "shallot", "shallots", "leek", "scallion", "chive"],
  },
];

const VALID_ALLERGEN_KEYS = new Set<string>(ALLERGEN_CATALOG.map((a) => a.key));

export function isAllergenKey(v: unknown): v is AllergenKey {
  return typeof v === "string" && VALID_ALLERGEN_KEYS.has(v);
}

export function sanitizeAllergenWatchlist(raw: unknown): AllergenKey[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<AllergenKey>();
  for (const item of raw) {
    if (isAllergenKey(item)) seen.add(item);
  }
  return [...seen];
}

export function toggleAllergenInList(current: AllergenKey[], key: AllergenKey): AllergenKey[] {
  if (current.includes(key)) {
    return current.filter((k) => k !== key);
  }
  return [...current, key];
}

/**
 * Checks a MenuItem's `containsAllergens` and `ingredients` against the customer's
 * personal allergen watchlist. Returns the human-readable labels of any matched watchlist items.
 */
export function matchItemAllergenWatchlist(
  item: Pick<MenuItem, "containsAllergens" | "ingredients">,
  watchlist: AllergenKey[],
): string[] {
  if (!watchlist.length) return [];
  const hayTokens = [
    ...toList(item.containsAllergens),
    ...toList(item.ingredients),
  ]
    .join(" ")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);

  if (hayTokens.length === 0) return [];
  const tokenSet = new Set(hayTokens);
  const matched: string[] = [];

  for (const key of watchlist) {
    const def = ALLERGEN_CATALOG.find((a) => a.key === key);
    if (!def) continue;
    const hit = def.terms.some((term) => {
      const parts = term.toLowerCase().split(/\s+/);
      if (parts.length === 1) return tokenSet.has(parts[0]);
      return parts.every((p) => tokenSet.has(p));
    });
    if (hit) matched.push(def.label);
  }
  return matched;
}

// ---------- Saved Delivery Addresses ----------

export type AddressTag = "HOME" | "WORK" | "OTHER";

export interface SavedAddress {
  id: string;
  tag: AddressTag;
  label: string;
  building: string;
  landmark?: string;
  areaLabel: string;
  lat: number;
  lng: number;
  updatedAt: string;
}

export function isValidSavedAddress(v: unknown): v is SavedAddress {
  if (!v || typeof v !== "object") return false;
  const a = v as SavedAddress;
  return (
    typeof a.id === "string" &&
    a.id.length > 0 &&
    (a.tag === "HOME" || a.tag === "WORK" || a.tag === "OTHER") &&
    typeof a.label === "string" &&
    a.label.trim().length > 0 &&
    typeof a.building === "string" &&
    a.building.trim().length > 0 &&
    typeof a.areaLabel === "string" &&
    a.areaLabel.trim().length > 0 &&
    typeof a.lat === "number" &&
    Number.isFinite(a.lat) &&
    Math.abs(a.lat) <= 90 &&
    typeof a.lng === "number" &&
    Number.isFinite(a.lng) &&
    Math.abs(a.lng) <= 180
  );
}

export function sanitizeSavedAddresses(raw: unknown): SavedAddress[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValidSavedAddress).slice(0, 8);
}

export function upsertSavedAddress(
  existing: SavedAddress[],
  input: Omit<SavedAddress, "id" | "updatedAt"> & { id?: string },
  maxCount = 8,
): SavedAddress[] {
  const label = input.label.trim() || (input.tag === "HOME" ? "Home" : input.tag === "WORK" ? "Work" : "Saved spot");
  const building = input.building.trim();
  const landmark = input.landmark?.trim() || undefined;
  const areaLabel = input.areaLabel.trim() || "Bengaluru";

  const entry: SavedAddress = {
    id: input.id || `addr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    tag: input.tag,
    label,
    building,
    landmark,
    areaLabel,
    lat: Number(input.lat.toFixed(4)),
    lng: Number(input.lng.toFixed(4)),
    updatedAt: new Date().toISOString(),
  };

  // Replace existing by id, or replace HOME/WORK if same singleton tag and same label
  const filtered = existing.filter((a) => {
    if (input.id && a.id === input.id) return false;
    if ((input.tag === "HOME" || input.tag === "WORK") && a.tag === input.tag) return false;
    return true;
  });

  return [entry, ...filtered].slice(0, maxCount);
}

export function removeSavedAddressById(existing: SavedAddress[], id: string): SavedAddress[] {
  return existing.filter((a) => a.id !== id);
}

// ---------- Communication & Privacy Consents ----------

export type ConsentPurpose = "ORDER_SMS_UPDATES" | "EMAIL_RECEIPTS" | "PROMOTIONAL_OFFERS";

export interface ConsentCatalogItem {
  purpose: ConsentPurpose;
  version: string;
  title: string;
  description: string;
}

export const CONSENT_CATALOG: ConsentCatalogItem[] = [
  {
    purpose: "ORDER_SMS_UPDATES",
    version: "1",
    title: "Order & rider SMS alerts",
    description: "Real-time kitchen acceptance, dispatch alerts, and delivery OTP messages.",
  },
  {
    purpose: "EMAIL_RECEIPTS",
    version: "1",
    title: "Tax invoices & email receipts",
    description: "Itemised GST bills and refund confirmations sent to your verified email.",
  },
  {
    purpose: "PROMOTIONAL_OFFERS",
    version: "1",
    title: "Seasonal Pure Veg & Jain specials",
    description: "Occasional curated menus for Paryushan, Navratri, and new Tier-1 kitchen launches.",
  },
];

export const DEFAULT_CONSENTS: Record<ConsentPurpose, boolean> = {
  ORDER_SMS_UPDATES: true,
  EMAIL_RECEIPTS: true,
  PROMOTIONAL_OFFERS: false,
};

export function sanitizeConsents(raw: unknown): Record<ConsentPurpose, boolean> {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CONSENTS };
  const obj = raw as Record<string, unknown>;
  return {
    ORDER_SMS_UPDATES:
      typeof obj.ORDER_SMS_UPDATES === "boolean" ? obj.ORDER_SMS_UPDATES : DEFAULT_CONSENTS.ORDER_SMS_UPDATES,
    EMAIL_RECEIPTS:
      typeof obj.EMAIL_RECEIPTS === "boolean" ? obj.EMAIL_RECEIPTS : DEFAULT_CONSENTS.EMAIL_RECEIPTS,
    PROMOTIONAL_OFFERS:
      typeof obj.PROMOTIONAL_OFFERS === "boolean" ? obj.PROMOTIONAL_OFFERS : DEFAULT_CONSENTS.PROMOTIONAL_OFFERS,
  };
}
