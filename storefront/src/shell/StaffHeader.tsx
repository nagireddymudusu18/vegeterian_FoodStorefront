"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/Logo";
import { NotificationBell } from "@/features/notifications";

export interface StaffLink {
  href: string;
  label: string;
  badge?: number;
}

/** Header shared by the kitchen, partner and admin areas: the brand, an area tag, optional section links and the account actions. */
export function StaffHeader({
  area,
  homeHref,
  links = [],
  bell = false,
  onLogout,
  storeLabel = "Storefront",
  widthClass = "max-w-4xl",
}: {
  area: string;
  homeHref: string;
  links?: StaffLink[];
  bell?: boolean;
  onLogout: () => void;
  storeLabel?: string;
  widthClass?: string;
}) {
  const pathname = usePathname();
  const active = (href: string) => (href === homeHref ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-cream/90 backdrop-blur">
      <div className={`mx-auto flex ${widthClass} items-center gap-2 px-4 py-2.5 sm:gap-3`}>
        <Link href={homeHref} aria-label={`Veggo Eats ${area}`} className="flex min-w-0 items-center gap-2 rounded-lg">
          <BrandLogo />
          <span className="rounded-full bg-haldi px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-ink">{area}</span>
        </Link>
        <div className="ml-auto flex items-center gap-1 text-sm">
          <Link href="/" className="hidden rounded-lg px-3 py-2 font-medium text-stone-700 hover:bg-stone-100 sm:block">
            {storeLabel}
          </Link>
          {bell && <NotificationBell />}
          <button type="button" onClick={onLogout} className="rounded-full bg-stone-100 px-4 py-2 font-semibold text-ink hover:bg-stone-200">
            Sign out
          </button>
        </div>
      </div>
      {links.length > 0 && (
        <nav aria-label={area} className="border-t border-stone-200/70">
          <ul className={`mx-auto flex ${widthClass} gap-1 overflow-x-auto px-4 py-1.5 text-sm`}>
            {links.map((l) => {
              const isActive = active(l.href);
              return (
                <li key={l.href} className="shrink-0">
                  <Link
                    href={l.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium ${
                      isActive ? "bg-leaf text-white" : "text-stone-700 hover:bg-stone-100"
                    }`}
                  >
                    <span>{l.label}</span>
                    {typeof l.badge === "number" && l.badge > 0 && (
                      <span
                        className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold leading-none ${
                          isActive ? "bg-white text-red-700" : "bg-red-600 text-white"
                        }`}
                      >
                        {l.badge}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </header>
  );
}
