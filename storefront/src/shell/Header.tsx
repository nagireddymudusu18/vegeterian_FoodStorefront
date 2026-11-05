"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/features/auth";
import {
  DIET_OPTIONS,
  HeaderLocationChip,
  openLocationPickerModal,
  usePrefs,
  type DietFilter,
} from "@/features/catalog";
import { NotificationBell } from "@/features/notifications";
import { BrandLogo } from "@/components/Logo";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/shadcn/sheet";
import { CartSheet } from "./CartSheet";

interface NavLink {
  href: string;
  label: string;
}

export function Header() {
  const pathname = usePathname();
  const { status, me } = useAuth();
  const { diet, setDiet, location } = usePrefs();
  const authed = status === "authed";

  const links: NavLink[] = [
    { href: "/", label: "Explore" },
    { href: "/track", label: "Track order" },
    ...(authed ? [{ href: "/orders", label: "Orders" }] : []),
  ];

  const account: NavLink | null =
    status === "loading"
      ? null
      : authed
        ? { href: "/profile", label: me?.name?.split(" ")[0] ?? me?.phone ?? me?.email ?? "Profile" }
        : { href: "/login", label: "Sign in" };

  const handleSelectDiet = (next: DietFilter) => {
    setDiet(next);
    const label = DIET_OPTIONS.find((d) => d.value === next)?.label ?? next;
    toast.success(`Dietary filter set to ${label}`);
  };

  const isLinkActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-cream/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5 sm:gap-3">
        <Link href="/" aria-label="Veggo Eats home" className="min-w-0 shrink-0 rounded-lg">
          <BrandLogo />
        </Link>
        <HeaderLocationChip />

        <nav aria-label="Main" className="ml-auto flex items-center gap-1 text-sm sm:gap-2">
          <div className="hidden items-center gap-1 md:flex">
            {links.map((l) => {
              const active = isLinkActive(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`whitespace-nowrap rounded-lg px-3 py-2 font-medium transition-colors ${
                    active ? "font-bold text-green-900 underline decoration-2 underline-offset-4" : "text-stone-700 hover:bg-stone-100 hover:text-ink"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </div>

          <CartSheet />
          <NotificationBell />
          {account && (
            <Link
              href={account.href}
              className={`hidden whitespace-nowrap rounded-full px-4 py-2 font-semibold transition sm:inline-flex ${
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
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Veggo Eats</SheetTitle>
                <SheetDescription>Veg, on the go · {location.label}</SheetDescription>
              </SheetHeader>

              <div className="space-y-4 px-2 py-2">
                <div className="flex items-center justify-between gap-2 border-b border-stone-200 pb-3">
                  <div>
                    <p className="text-xs text-stone-500">Delivering to</p>
                    <p className="text-sm font-bold text-ink">{location.label}</p>
                  </div>
                  <SheetClose asChild>
                    <button
                      type="button"
                      onClick={openLocationPickerModal}
                      className="text-xs font-bold text-green-800 underline hover:text-ink"
                    >
                      Change spot
                    </button>
                  </SheetClose>
                </div>

                <div className="space-y-1.5 border-b border-stone-200 pb-3">
                  <p className="px-1 text-xs font-bold text-stone-600">Dietary preference</p>
                  <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Mobile dietary preference">
                    {DIET_OPTIONS.map((opt) => {
                      const active = diet === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => handleSelectDiet(opt.value)}
                          className={`rounded-xl px-3 py-2 text-left text-xs font-bold transition ${
                            active
                              ? "bg-green-800 text-white"
                              : "border border-stone-200 bg-white text-ink hover:bg-stone-100"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <ul className="space-y-1">
                  {[...links, ...(account ? [account] : [])].map((l) => (
                    <li key={l.href}>
                      <SheetClose asChild>
                        <Link
                          href={l.href}
                          className="block rounded-xl px-3 py-2.5 text-base font-semibold text-ink hover:bg-stone-100"
                        >
                          {l.label}
                        </Link>
                      </SheetClose>
                    </li>
                  ))}
                </ul>
              </div>
            </SheetContent>
          </Sheet>
        </nav>
      </div>
    </header>
  );
}
