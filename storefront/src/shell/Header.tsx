"use client";

import Link from "next/link";
import { useAuth } from "@/features/auth";
import { useCart } from "@/features/cart";
import { NotificationBell } from "@/features/notifications";
import { identity } from "@/lib/api";

export function Header() {
  const { status, me } = useAuth();
  const { count } = useCart();

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-green-800">
          <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-green-600 text-white">
            🌿
          </span>
          Veggo Eats
        </Link>
        <nav aria-label="Main" className="ml-auto flex items-center gap-1 text-sm sm:gap-3">
          <Link href="/track" className="rounded-lg px-2 py-2 hover:bg-stone-100">
            Track order
          </Link>
          {status === "authed" && identity.isAdmin(me) && (
            <Link href="/admin" className="rounded-lg px-2 py-2 hover:bg-stone-100">
              Admin
            </Link>
          )}
          {status === "authed" && me?.roles?.includes("RESTAURANT") && (
            <Link href="/restaurant" className="rounded-lg px-2 py-2 hover:bg-stone-100">
              Kitchen
            </Link>
          )}
          {status === "authed" && me?.roles?.includes("PARTNER") && (
            <Link href="/partner" className="rounded-lg px-2 py-2 hover:bg-stone-100">
              Deliveries
            </Link>
          )}
          {status === "authed" && (
            <Link href="/orders" className="rounded-lg px-2 py-2 hover:bg-stone-100">
              Orders
            </Link>
          )}
          <Link href="/cart" className="relative rounded px-2 py-2 hover:bg-stone-100" aria-label={`Cart, ${count} items`}>
            Cart
            {count > 0 && (
              <span
                className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-green-700 px-1.5 text-xs font-semibold text-white"
                aria-hidden="true"
              >
                {count}
              </span>
            )}
          </Link>
          <NotificationBell />
          {status === "loading" ? (
            <span className="px-2 text-stone-400" aria-live="polite">
              ...
            </span>
          ) : status === "authed" ? (
            <Link href="/profile" className="rounded bg-stone-100 px-3 py-2 hover:bg-stone-200">
              {me?.name?.split(" ")[0] ?? me?.phone ?? me?.email ?? "Profile"}
            </Link>
          ) : (
            <Link href="/login" className="rounded bg-green-700 px-3 py-2 font-medium text-white hover:bg-green-800">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
