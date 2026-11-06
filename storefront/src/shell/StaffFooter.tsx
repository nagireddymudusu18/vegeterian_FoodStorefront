"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/Logo";
import { BRAND } from "@/lib/brand";

export interface StaffFooterProps {
  area: "Kitchen" | "Partner" | "Admin";
  widthClass?: string;
}

export function StaffFooter({ area, widthClass = "max-w-4xl" }: StaffFooterProps) {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const isKitchen = area === "Kitchen";
  const isPartner = area === "Partner";

  const portalHome = isKitchen ? "/restaurant" : isPartner ? "/partner" : "/admin";

  const primaryLinks = isKitchen
    ? [
        { href: "/restaurant", label: "Orders" },
        { href: "/restaurant/menu", label: "Menu & Availability" },
      ]
    : isPartner
      ? [{ href: "/partner", label: "Dispatch & Earnings" }]
      : [
          { href: "/admin", label: "Dashboard" },
          { href: "/admin/restaurants", label: "Restaurants" },
          { href: "/admin/deliveries", label: "Deliveries" },
          { href: "/admin/refunds", label: "Refunds" },
        ];

  return (
    <footer className="mt-16 border-t border-stone-200/90 bg-white text-stone-600">
      <div className={`mx-auto ${widthClass} px-4 py-8 sm:py-10`}>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-12">
          <div className="col-span-2 space-y-2.5 sm:col-span-6">
            <div className="flex items-center gap-2">
              <Link href={portalHome} className="inline-flex items-center gap-2 rounded-lg">
                <BrandLogo />
              </Link>
              <span className="rounded-full bg-haldi px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-ink">
                {area}
              </span>
            </div>
            <p className="max-w-xs text-sm text-stone-600">
              {isKitchen
                ? "Restaurant Partner Portal"
                : isPartner
                  ? "Delivery Partner Portal"
                  : "Admin Portal"}
            </p>
          </div>

          <div className="space-y-2 sm:col-span-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink">Navigation</h2>
            <ul className="space-y-2 text-sm">
              {primaryLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="transition hover:text-green-800 hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2 sm:col-span-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink">Support &amp; Legal</h2>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/terms" className="transition hover:text-green-800 hover:underline">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="transition hover:text-green-800 hover:underline">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/contact" className="transition hover:text-green-800 hover:underline">
                  Contact Support
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-stone-200/80 pt-5 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {new Date().getFullYear()} <span className="font-semibold text-ink">{BRAND.name}</span>. All rights
            reserved.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/privacy" className="hover:text-ink hover:underline">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-ink hover:underline">
              Terms of Service
            </Link>
            <button
              type="button"
              onClick={scrollToTop}
              className="font-semibold text-green-800 transition hover:text-ink hover:underline"
            >
              Back to top &uarr;
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
