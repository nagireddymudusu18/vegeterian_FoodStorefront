/** Pure cart logic (no React, no storage) so it can be unit-tested. */
import type { DietFilter } from "../catalog/diet";

export interface CartLine {
  itemId: string;
  name: string;
  /** Unit price in paise as last seen in the catalog: ESTIMATE only. The server recomputes. */
  pricePaise: number;
  quantity: number;
  isPureVeg?: boolean;
  isVegan?: boolean;
  isJain?: boolean;
  containsAllergens?: string[];
}

export interface Cart {
  restaurantId: string | null;
  restaurantName: string | null;
  lines: CartLine[];
}

export const MAX_QTY_PER_LINE = 20;

export const emptyCart: Cart = { restaurantId: null, restaurantName: null, lines: [] };

export interface AddItem {
  itemId: string;
  name: string;
  pricePaise: number;
  isPureVeg?: boolean;
  isVegan?: boolean;
  isJain?: boolean;
  containsAllergens?: string[];
}

function withMeta(target: CartLine, src: Partial<AddItem>): CartLine {
  const out: CartLine = {
    itemId: target.itemId,
    name: target.name,
    pricePaise: target.pricePaise,
    quantity: target.quantity,
  };
  const pureVeg = src.isPureVeg ?? target.isPureVeg;
  const vegan = src.isVegan ?? target.isVegan;
  const jain = src.isJain ?? target.isJain;
  const allergens = src.containsAllergens ?? target.containsAllergens;
  if (typeof pureVeg === "boolean") out.isPureVeg = pureVeg;
  if (typeof vegan === "boolean") out.isVegan = vegan;
  if (typeof jain === "boolean") out.isJain = jain;
  if (Array.isArray(allergens) && allergens.length > 0) {
    out.containsAllergens = allergens.filter((a): a is string => typeof a === "string" && a.trim().length > 0);
  }
  return out;
}

/** True when adding from `restaurantId` would discard a non-empty cart of another restaurant. */
export function wouldSwitchRestaurant(cart: Cart, restaurantId: string): boolean {
  return cart.lines.length > 0 && cart.restaurantId !== null && cart.restaurantId !== restaurantId;
}

export function addItem(
  cart: Cart,
  restaurant: { id: string; name: string },
  item: AddItem,
): Cart {
  const base: Cart = wouldSwitchRestaurant(cart, restaurant.id)
    ? { restaurantId: restaurant.id, restaurantName: restaurant.name, lines: [] }
    : { ...cart, restaurantId: restaurant.id, restaurantName: restaurant.name };
  const existing = base.lines.find((l) => l.itemId === item.itemId);
  if (existing) {
    return {
      ...base,
      lines: base.lines.map((l) =>
        l.itemId === item.itemId
          ? withMeta({ ...l, pricePaise: item.pricePaise, quantity: Math.min(MAX_QTY_PER_LINE, l.quantity + 1) }, item)
          : l,
      ),
    };
  }
  return {
    ...base,
    lines: [
      ...base.lines,
      withMeta({ itemId: item.itemId, name: item.name, pricePaise: item.pricePaise, quantity: 1 }, item),
    ],
  };
}

export function decrementItem(cart: Cart, itemId: string): Cart {
  const lines = cart.lines
    .map((l) => (l.itemId === itemId ? { ...l, quantity: l.quantity - 1 } : l))
    .filter((l) => l.quantity > 0);
  return normalize({ ...cart, lines });
}

export function removeItem(cart: Cart, itemId: string): Cart {
  return normalize({ ...cart, lines: cart.lines.filter((l) => l.itemId !== itemId) });
}

function normalize(cart: Cart): Cart {
  return cart.lines.length === 0 ? emptyCart : cart;
}

export function quantityOf(cart: Cart, itemId: string): number {
  return cart.lines.find((l) => l.itemId === itemId)?.quantity ?? 0;
}

export function itemCount(cart: Cart): number {
  return cart.lines.reduce((n, l) => n + l.quantity, 0);
}

/** ESTIMATED subtotal in paise (no tax/delivery). The server's figure is authoritative. */
export function estimatedSubtotalPaise(cart: Cart): number {
  return cart.lines.reduce((sum, l) => sum + l.pricePaise * l.quantity, 0);
}

/**
 * Returns cart lines that conflict with the customer's selected diet filter,
 * or non-veg items (`isPureVeg === false`) even when the filter is `"ALL"`.
 */
export function cartDietConflicts(cart: Cart, diet: DietFilter): CartLine[] {
  return cart.lines.filter((l) => {
    if (l.isPureVeg === false) return true;
    if (diet === "VEGAN" && l.isVegan === false) return true;
    if (diet === "JAIN" && l.isJain === false) return true;
    return false;
  });
}

/** Deduplicated, sorted list of allergens present across all lines in the cart. */
export function cartAllergens(cart: Cart): string[] {
  const set = new Set<string>();
  for (const l of cart.lines) {
    for (const a of l.containsAllergens ?? []) {
      const trimmed = a.trim().toLowerCase();
      if (trimmed) set.add(trimmed);
    }
  }
  return [...set].sort();
}

/** Validates/sanitises untrusted JSON read from localStorage. */
export function parseCart(raw: string | null): Cart {
  if (!raw) return emptyCart;
  try {
    const v = JSON.parse(raw) as Partial<Cart>;
    if (!v || typeof v !== "object" || !Array.isArray(v.lines) || typeof v.restaurantId !== "string") {
      return emptyCart;
    }
    const lines = v.lines
      .filter(
        (l): l is CartLine =>
          !!l &&
          typeof l.itemId === "string" &&
          typeof l.name === "string" &&
          Number.isInteger(l.pricePaise) &&
          Number.isInteger(l.quantity) &&
          l.quantity > 0,
      )
      .map((l) => withMeta(l, l));
    if (lines.length === 0) return emptyCart;
    return {
      restaurantId: v.restaurantId,
      restaurantName: typeof v.restaurantName === "string" ? v.restaurantName : null,
      lines,
    };
  } catch {
    return emptyCart;
  }
}

/** Body for POST /orders: ids and quantities only, never prices. */
export function toOrderLines(cart: Cart): { itemId: string; quantity: number }[] {
  return cart.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity }));
}
