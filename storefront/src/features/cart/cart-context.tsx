"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  addItem as addToCart,
  decrementItem,
  emptyCart,
  itemCount,
  parseCart,
  removeItem as removeFromCart,
  wouldSwitchRestaurant,
  type AddItem,
  type Cart,
} from "./cart";

const KEY = "sf.cart.v1";

interface CartCtx {
  ready: boolean;
  cart: Cart;
  count: number;
  /** Returns "switch-needed" (and does nothing) if the item belongs to another restaurant and `replace` is not set. */
  add: (restaurant: { id: string; name: string }, item: AddItem, replace?: boolean) => "added" | "switch-needed";
  decrement: (itemId: string) => void;
  remove: (itemId: string) => void;
  clear: () => void;
}

const Ctx = createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [cart, setCart] = useState<Cart>(emptyCart);

  useEffect(() => {
    setCart(parseCart(window.localStorage.getItem(KEY)));
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setCart(parseCart(e.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(cart));
    } catch {
      /* ignore */
    }
  }, [cart, ready]);

  const add = useCallback<CartCtx["add"]>(
    (restaurant, item, replace) => {
      if (!replace && wouldSwitchRestaurant(cart, restaurant.id)) return "switch-needed";
      setCart((c) => addToCart(c, restaurant, item));
      return "added";
    },
    [cart],
  );
  const decrement = useCallback((id: string) => setCart((c) => decrementItem(c, id)), []);
  const remove = useCallback((id: string) => setCart((c) => removeFromCart(c, id)), []);
  const clear = useCallback(() => setCart(emptyCart), []);

  const value = useMemo(
    () => ({ ready, cart, count: itemCount(cart), add, decrement, remove, clear }),
    [ready, cart, add, decrement, remove, clear],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart(): CartCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart must be used inside CartProvider");
  return c;
}
