"use client";

import Link from "next/link";
import { useAuth } from "@/features/auth";
import { NotificationBell } from "@/features/notifications";
import { identity } from "@/lib/api";
import { BrandLogo } from "@/components/Logo";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/shadcn/sheet";
import { CartSheet } from "./CartSheet";

interface NavLink {
  href: string;
  label: string;
}

export function Header() {
  const { status, me } = useAuth();
  const authed = status === "authed";

  const links = [
    { href: "/track", label: "Track order" },
    authed && identity.isAdmin(me) && { href: "/admin", label: "Admin" },
    authed && me?.roles?.includes("RESTAURANT") && { href: "/restaurant", label: "Kitchen" },
    authed && me?.roles?.includes("PARTNER") && { href: "/partner", label: "Deliveries" },
    authed && { href: "/orders", label: "Orders" },
  ].filter((l): l is NavLink => Boolean(l));

  const account: NavLink | null =
    status === "loading"
      ? null
      : authed
        ? { href: "/profile", label: me?.name?.split(" ")[0] ?? me?.phone ?? me?.email ?? "Profile" }
        : { href: "/login", label: "Sign in" };

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-cream/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5 sm:gap-3">
        <Link href="/" aria-label="Veggo Eats home" className="min-w-0 rounded-lg">
          <BrandLogo />
        </Link>
        <nav aria-label="Main" className="ml-auto flex items-center gap-1 text-sm sm:gap-2">
          <div className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 font-medium text-stone-700 hover:bg-stone-100">
                {l.label}
              </Link>
            ))}
          </div>
          <CartSheet />
          <NotificationBell />
          {account && (
            <Link
              href={account.href}
              className={`hidden rounded-full px-4 py-2 font-semibold sm:inline-flex ${
                authed ? "bg-stone-100 text-ink hover:bg-stone-200" : "bg-ink text-white hover:bg-stone-800"
              }`}
            >
              {account.label}
            </Link>
          )}
          <Sheet>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Menu"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-stone-100 md:hidden"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
                <SheetDescription>Veg, on the go.</SheetDescription>
              </SheetHeader>
              <ul className="space-y-1 px-2">
                {[...links, ...(account ? [account] : [])].map((l) => (
                  <li key={l.href}>
                    <SheetClose asChild>
                      <Link href={l.href} className="block rounded-xl px-3 py-3 text-base font-semibold text-ink hover:bg-stone-100">
                        {l.label}
                      </Link>
                    </SheetClose>
                  </li>
                ))}
              </ul>
            </SheetContent>
          </Sheet>
        </nav>
      </div>
    </header>
  );
}
