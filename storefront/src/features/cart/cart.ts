/** Pure cart logic (no React, no storage) so it can be unit-tested. */

export interface CartLine {
  itemId: string;
  name: string;
  /** Unit price in paise as last seen in the catalog: ESTIMATE only. The server recomputes. */
  pricePaise: number;
  quantity: number;
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
          ? { ...l, pricePaise: item.pricePaise, quantity: Math.min(MAX_QTY_PER_LINE, l.quantity + 1) }
          : l,
      ),
    };
  }
  return { ...base, lines: [...base.lines, { ...item, quantity: 1 }] };
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

/** Validates/sanitises untrusted JSON read from localStorage. */
export function parseCart(raw: string | null): Cart {
  if (!raw) return emptyCart;
  try {
    const v = JSON.parse(raw) as Partial<Cart>;
    if (!v || typeof v !== "object" || !Array.isArray(v.lines) || typeof v.restaurantId !== "string") {
      return emptyCart;
    }
    const lines = v.lines.filter(
      (l): l is CartLine =>
        !!l &&
        typeof l.itemId === "string" &&
        typeof l.name === "string" &&
        Number.isInteger(l.pricePaise) &&
        Number.isInteger(l.quantity) &&
        l.quantity > 0,
    );
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
