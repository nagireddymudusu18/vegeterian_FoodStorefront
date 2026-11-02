"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { m } from "@/components/motion";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/shadcn/sheet";
import { estimatedSubtotalPaise, useCart } from "@/features/cart";
import { formatPaise } from "@/lib/money";

const TRIGGER_CLASS =
  "relative inline-flex items-center gap-1.5 rounded-full bg-green-700 px-3 py-2 text-sm font-semibold text-white hover:bg-green-800";

function CartIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4h2l2.2 10.2a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L19.5 8H6" />
      <circle cx="9.5" cy="19" r="1.2" />
      <circle cx="16.5" cy="19" r="1.2" />
    </svg>
  );
}

/** Header cart: opens a slide-over mini cart. On the cart and checkout pages it is a plain link. */
export function CartSheet() {
  const { cart, count, add, decrement, remove } = useCart();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  const label = `Cart, ${count} items`;
  const badge = count > 0 && (
    <m.span
      key={count}
      initial={{ scale: 1.5 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 18 }}
      className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-bold text-ink"
      aria-hidden="true"
    >
      {count}
    </m.span>
  );

  if (pathname === "/cart" || pathname === "/checkout") {
    return (
      <Link href="/cart" className={TRIGGER_CLASS} aria-label={label}>
        <CartIcon />
        <span className="hidden sm:inline">Cart</span>
        {badge}
      </Link>
    );
  }

  const restaurant = cart.restaurantId ? { id: cart.restaurantId, name: cart.restaurantName ?? "Restaurant" } : null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) toast.dismiss();
        setOpen(next);
      }}
    >
      <SheetTrigger asChild>
        <button type="button" className={TRIGGER_CLASS} aria-label={label}>
          <CartIcon />
          <span className="hidden sm:inline">Cart</span>
          {badge}
        </button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Your cart</SheetTitle>
          <SheetDescription>{restaurant ? `From ${restaurant.name}` : "Nothing here yet"}</SheetDescription>
        </SheetHeader>

        {!restaurant || cart.lines.length === 0 ? (
          <div className="px-4 text-sm text-stone-600">
            <p>Your cart is empty.</p>
            <SheetClose asChild>
              <Link href="/" className="mt-2 inline-block font-medium text-green-800 underline">
                Browse restaurants
              </Link>
            </SheetClose>
          </div>
        ) : (
          <>
            <ul className="flex-1 space-y-3 overflow-y-auto px-4">
              {cart.lines.map((l) => (
                <li key={l.itemId} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.name}</p>
                    <p className="text-stone-600">{formatPaise(l.pricePaise * l.quantity)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="inline-flex items-center rounded-lg border border-stone-300" role="group" aria-label={`Quantity of ${l.name}`}>
                      <button
                        type="button"
                        onClick={() => decrement(l.itemId)}
                        aria-label={`Remove one ${l.name}`}
                        className="h-8 w-8 font-bold hover:bg-stone-100"
                      >
                        -
                      </button>
                      <span className="min-w-6 text-center font-semibold" aria-live="polite">
                        {l.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => add(restaurant, { itemId: l.itemId, name: l.name, pricePaise: l.pricePaise })}
                        aria-label={`Add one more ${l.name}`}
                        className="h-8 w-8 font-bold hover:bg-stone-100"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(l.itemId)}
                      aria-label={`Remove ${l.name} from cart`}
                      className="text-xs text-red-700 underline"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <SheetFooter className="border-t border-stone-200">
              <div className="flex justify-between font-semibold">
                <span>Estimated subtotal</span>
                <span>{formatPaise(estimatedSubtotalPaise(cart))}</span>
              </div>
              <SheetClose asChild>
                <Link
                  href="/checkout"
                  className="btn-primary"
                >
                  Proceed to checkout
                </Link>
              </SheetClose>
              <SheetClose asChild>
                <Link href="/cart" className="btn-secondary py-2.5 text-sm">
                  View full cart
                </Link>
              </SheetClose>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
