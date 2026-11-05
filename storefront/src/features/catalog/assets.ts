import type { MenuItem, Restaurant } from "@/lib/api";

export type CulinaryIconKind = "dosa" | "curry" | "biryani" | "chaat" | "sweet" | "beverage";

export interface CuratedAssetPreset {
  id: string;
  label: string;
  cuisine: string;
  src: string;
  alt: string;
  focalPoint: string;
  accentColor: string;
  icon: CulinaryIconKind;
}

export interface ResolvedRestaurantAsset {
  src: string;
  alt: string;
  focalPoint: string;
  tag: string;
  icon: CulinaryIconKind;
  tintBg: string;
  tintInk: string;
}

export interface ResolvedDishAsset {
  src: string;
  alt: string;
  focalPoint: string;
  categoryLabel: string;
  icon: CulinaryIconKind;
  tintBg: string;
  tintInk: string;
}

/**
 * Curated self-hosted culinary photography artifacts stored in `/public/assets/food/`.
 * Served from the same origin (`/assets/food/...`) so they comply strictly with
 * the production Caddy Content-Security-Policy (`img-src 'self' data:`).
 */
export const CURATED_CULINARY_ASSETS: readonly CuratedAssetPreset[] = [
  {
    id: "saffron-south-indian",
    label: "South Indian Thali & Masala Dosa",
    cuisine: "South Indian",
    src: "/assets/food/saffron-south-indian.jpg",
    alt: "Crispy golden masala dosa, steamed idlis, sambar, and paneer butter masala on a brass platter",
    focalPoint: "50% 52%",
    accentColor: "#1B5E3A",
    icon: "dosa",
  },
  {
    id: "green-leaf-vegan",
    label: "Artisanal 100% Vegan Bowls",
    cuisine: "Vegan",
    src: "/assets/food/green-leaf-vegan.jpg",
    alt: "Charred tofu tikka bowl, jackfruit biryani, and spiced chickpea chana masala in stoneware bowls",
    focalPoint: "50% 48%",
    accentColor: "#15803D",
    icon: "biryani",
  },
  {
    id: "jain-rasoi-thali",
    label: "Jain Gujarati Kansa Spread",
    cuisine: "Gujarati",
    src: "/assets/food/jain-rasoi-thali.jpg",
    alt: "Traditional Jain Gujarati spread with khaman dhokla, sabudana khichdi, Jain pav bhaji, and kesar shrikhand",
    focalPoint: "50% 58%",
    accentColor: "#B45309",
    icon: "chaat",
  },
  {
    id: "spice-route-north-indian",
    label: "North Indian Handi & Tandoor",
    cuisine: "North Indian",
    src: "/assets/food/spice-route-north-indian.jpg",
    alt: "North Indian copper handi biryani, rich tomato gravy curry, dal tadka, and tandoori rotis",
    focalPoint: "50% 50%",
    accentColor: "#9A3412",
    icon: "curry",
  },
] as const;

/**
 * Validates that an image URL is safe and compliant with `img-src 'self' data:`.
 * Rejects external HTTP(S) domains that would violate CSP or break in offline/sandbox environments.
 */
export function isSafeSelfHostedAssetUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/assets/") && !trimmed.startsWith("//")) return true;
  if (/^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,[a-zA-Z0-9+/=]+$/i.test(trimmed)) return true;
  return false;
}

const RESTAURANT_ASSET_BY_ID: Record<string, { presetId: string; focalPoint: string; tag: string }> = {
  "rest-saffron-1": {
    presetId: "saffron-south-indian",
    focalPoint: "52% 54%",
    tag: "UDUPI & NORTH INDIAN PURE VEG",
  },
  "rest-green-2": {
    presetId: "green-leaf-vegan",
    focalPoint: "50% 46%",
    tag: "100% PLANT-BASED KITCHEN",
  },
  "rest-jain-3": {
    presetId: "jain-rasoi-thali",
    focalPoint: "50% 58%",
    tag: "STRICT SATVIK & JAIN RASOI",
  },
  "rest-spice-4": {
    presetId: "spice-route-north-indian",
    focalPoint: "50% 50%",
    tag: "TANDOOR & HANDI CURRIES",
  },
};

export function resolveRestaurantAsset(
  restaurant: Pick<Restaurant, "id" | "name" | "cuisine" | "kitchenCertificationLevel"> & { imageUrl?: string | null },
): ResolvedRestaurantAsset {
  const customUrl = isSafeSelfHostedAssetUrl(restaurant.imageUrl) ? restaurant.imageUrl!.trim() : null;
  const mapped = RESTAURANT_ASSET_BY_ID[restaurant.id];
  const cuisineLower = (restaurant.cuisine ?? "").toLowerCase();

  let preset = CURATED_CULINARY_ASSETS[0];
  if (mapped) {
    preset = CURATED_CULINARY_ASSETS.find((p) => p.id === mapped.presetId) ?? preset;
  } else if (cuisineLower.includes("vegan") || cuisineLower.includes("plant")) {
    preset = CURATED_CULINARY_ASSETS[1];
  } else if (cuisineLower.includes("jain") || cuisineLower.includes("gujarati") || cuisineLower.includes("rajasthani")) {
    preset = CURATED_CULINARY_ASSETS[2];
  } else if (cuisineLower.includes("north") || cuisineLower.includes("mughlai") || cuisineLower.includes("punjabi")) {
    preset = CURATED_CULINARY_ASSETS[3];
  }

  const isTier2 = restaurant.kitchenCertificationLevel === "TIER_2_SEGREGATED_KITCHEN";
  return {
    src: customUrl ?? preset.src,
    alt: `${restaurant.name} — ${preset.alt}`,
    focalPoint: mapped?.focalPoint ?? preset.focalPoint,
    tag: mapped?.tag ?? (isTier2 ? "SEGREGATED VEG KITCHEN" : "CERTIFIED PURE VEG"),
    icon: preset.icon,
    tintBg: isTier2 ? "bg-amber-100" : "bg-haldi",
    tintInk: isTier2 ? "text-amber-900" : "text-green-800",
  };
}

const DISH_FOCAL_BY_ID: Record<string, { presetId: string; focalPoint: string; categoryLabel: string; icon: CulinaryIconKind }> = {
  // Saffron Pure Veg Bhavan
  "item-saffron-1": { presetId: "saffron-south-indian", focalPoint: "68% 18%", categoryLabel: "Paneer Handi", icon: "curry" },
  "item-saffron-2": { presetId: "saffron-south-indian", focalPoint: "60% 58%", categoryLabel: "Tawa Dosa", icon: "dosa" },
  "item-saffron-3": { presetId: "saffron-south-indian", focalPoint: "44% 62%", categoryLabel: "Steamed Idli", icon: "dosa" },
  "item-saffron-4": { presetId: "spice-route-north-indian", focalPoint: "16% 68%", categoryLabel: "Ghee Dal Tadka", icon: "curry" },
  "item-saffron-5": { presetId: "green-leaf-vegan", focalPoint: "18% 64%", categoryLabel: "Dum Biryani", icon: "biryani" },
  "item-saffron-6": { presetId: "jain-rasoi-thali", focalPoint: "78% 72%", categoryLabel: "Warm Mithai", icon: "sweet" },

  // Green Leaf Vegan Kitchen
  "item-green-1": { presetId: "green-leaf-vegan", focalPoint: "50% 44%", categoryLabel: "Charred Tofu", icon: "curry" },
  "item-green-2": { presetId: "green-leaf-vegan", focalPoint: "85% 60%", categoryLabel: "Protein Bowl", icon: "curry" },
  "item-green-3": { presetId: "green-leaf-vegan", focalPoint: "18% 64%", categoryLabel: "Jackfruit Dum", icon: "biryani" },
  "item-green-4": { presetId: "jain-rasoi-thali", focalPoint: "78% 72%", categoryLabel: "Coconut Kheer", icon: "sweet" },
  "item-green-5": { presetId: "jain-rasoi-thali", focalPoint: "40% 46%", categoryLabel: "Millet Tiffin", icon: "chaat" },
  "item-green-6": { presetId: "green-leaf-vegan", focalPoint: "68% 12%", categoryLabel: "Oat Smoothie", icon: "beverage" },

  // Jain Rasoi
  "item-jain-1": { presetId: "jain-rasoi-thali", focalPoint: "74% 46%", categoryLabel: "Jain Pav Bhaji", icon: "chaat" },
  "item-jain-2": { presetId: "jain-rasoi-thali", focalPoint: "40% 46%", categoryLabel: "Falahari Khichdi", icon: "chaat" },
  "item-jain-3": { presetId: "jain-rasoi-thali", focalPoint: "50% 72%", categoryLabel: "Steamed Farsan", icon: "chaat" },
  "item-jain-4": { presetId: "green-leaf-vegan", focalPoint: "50% 44%", categoryLabel: "Tandoori Tikka", icon: "curry" },
  "item-jain-5": { presetId: "jain-rasoi-thali", focalPoint: "78% 72%", categoryLabel: "Kesar Dessert", icon: "sweet" },
  "item-jain-6": { presetId: "spice-route-north-indian", focalPoint: "16% 68%", categoryLabel: "Gujarati Dal", icon: "curry" },

  // Spice Route Kitchen
  "item-spice-1": { presetId: "spice-route-north-indian", focalPoint: "52% 52%", categoryLabel: "Handi Biryani", icon: "biryani" },
  "item-spice-2": { presetId: "spice-route-north-indian", focalPoint: "28% 42%", categoryLabel: "Makhani Gravy", icon: "curry" },
  "item-spice-3": { presetId: "saffron-south-indian", focalPoint: "68% 18%", categoryLabel: "Masala Gravy", icon: "curry" },
  "item-spice-4": { presetId: "spice-route-north-indian", focalPoint: "82% 35%", categoryLabel: "Tawa Roast", icon: "chaat" },
  "item-spice-5": { presetId: "saffron-south-indian", focalPoint: "52% 54%", categoryLabel: "Complete Thali", icon: "dosa" },
  "item-spice-6": { presetId: "spice-route-north-indian", focalPoint: "16% 68%", categoryLabel: "Slow-Simmered Dal", icon: "curry" },
};

export function classifyDishHeuristic(name: string, description?: string | null): {
  presetId: string;
  focalPoint: string;
  categoryLabel: string;
  icon: CulinaryIconKind;
} {
  const hay = `${name} ${description ?? ""}`.toLowerCase();
  if (hay.includes("dosa") || hay.includes("idli") || hay.includes("uttapam") || hay.includes("sambar")) {
    return { presetId: "saffron-south-indian", focalPoint: "58% 58%", categoryLabel: "South Indian Tiffin", icon: "dosa" };
  }
  if (hay.includes("biryani") || hay.includes("pulao") || hay.includes("rice") || hay.includes("khichdi")) {
    return { presetId: "green-leaf-vegan", focalPoint: "18% 64%", categoryLabel: "Rice & Biryani", icon: "biryani" };
  }
  if (hay.includes("dhokla") || hay.includes("pav") || hay.includes("chaat") || hay.includes("upma") || hay.includes("samosa")) {
    return { presetId: "jain-rasoi-thali", focalPoint: "50% 72%", categoryLabel: "Farsan & Snack", icon: "chaat" };
  }
  if (
    hay.includes("jamun") ||
    hay.includes("kheer") ||
    hay.includes("shrikhand") ||
    hay.includes("halwa") ||
    hay.includes("sweet") ||
    hay.includes("dessert")
  ) {
    return { presetId: "jain-rasoi-thali", focalPoint: "78% 72%", categoryLabel: "Artisanal Sweet", icon: "sweet" };
  }
  if (hay.includes("smoothie") || hay.includes("lassi") || hay.includes("chai") || hay.includes("coffee") || hay.includes("juice")) {
    return { presetId: "green-leaf-vegan", focalPoint: "68% 12%", categoryLabel: "Fresh Beverage", icon: "beverage" };
  }
  return { presetId: "saffron-south-indian", focalPoint: "68% 18%", categoryLabel: "Signature Curry", icon: "curry" };
}

export function resolveMenuItemAsset(
  item: Pick<MenuItem, "id" | "name" | "description" | "isPureVeg" | "isVegan" | "isJain"> & { imageUrl?: string | null },
  restaurantName?: string,
): ResolvedDishAsset {
  const customUrl = isSafeSelfHostedAssetUrl(item.imageUrl) ? item.imageUrl!.trim() : null;
  const mapped = DISH_FOCAL_BY_ID[item.id] ?? classifyDishHeuristic(item.name, item.description);
  const preset = CURATED_CULINARY_ASSETS.find((p) => p.id === mapped.presetId) ?? CURATED_CULINARY_ASSETS[0];

  return {
    src: customUrl ?? preset.src,
    alt: restaurantName ? `${item.name} from ${restaurantName}` : item.name,
    focalPoint: mapped.focalPoint,
    categoryLabel: mapped.categoryLabel,
    icon: mapped.icon,
    tintBg: item.isPureVeg ? "bg-haldi/70" : "bg-amber-100",
    tintInk: item.isPureVeg ? "text-green-800" : "text-amber-900",
  };
}
