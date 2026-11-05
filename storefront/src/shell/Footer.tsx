"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DIET_OPTIONS,
  openLocationPickerModal,
  usePrefs,
  type DietFilter,
} from "@/features/catalog";
import { BrandLogo } from "@/components/Logo";
import { BRAND } from "@/lib/brand";

export function Footer() {
  const router = useRouter();
  const pathname = usePathname();
  const { diet, setDiet, location } = usePrefs();

  const handleDietClick = (next: DietFilter) => {
    setDiet(next);
    const label = DIET_OPTIONS.find((d) => d.value === next)?.label ?? next;
    toast.success(`Showing ${label} kitchens`);
    if (pathname !== "/") {
      router.push("/");
    } else {
      document.getElementById("list-h")?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <footer className="mt-16 border-t border-stone-200/90 bg-white text-stone-600">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:py-12">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-12">
          {/* Brand column */}
          <div className="col-span-2 space-y-3 sm:col-span-4">
            <Link href="/" className="inline-flex items-center gap-2 rounded-lg">
              <BrandLogo />
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-stone-600">
              Pure vegetarian, vegan, and Jain meals prepared fresh and delivered to your doorstep across India.
            </p>
            <p className="text-xs text-stone-500">
              Delivering to{" "}
              <button
                type="button"
                onClick={openLocationPickerModal}
                className="font-semibold text-green-800 underline decoration-green-800/40 underline-offset-2 transition hover:text-ink"
              >
                {location.label}
              </button>
            </p>
          </div>

          {/* Explore by Diet (clean typographic links) */}
          <div className="space-y-2.5 sm:col-span-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink">Cuisines &amp; Diet</h2>
            <ul className="space-y-2 text-sm">
              {DIET_OPTIONS.map((opt) => {
                const active = diet === opt.value;
                return (
                  <li key={opt.value}>
                    <button
                      type="button"
                      onClick={() => handleDietClick(opt.value)}
                      className={`group inline-flex items-center gap-1.5 text-left transition hover:text-green-800 ${
                        active ? "font-bold text-green-800" : "text-stone-600"
                      }`}
                    >
                      <span className="group-hover:underline">{opt.label}</span>
                      {active && (
                        <span aria-hidden="true" className="text-xs text-green-800">
                          · Active
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Customer links */}
          <div className="space-y-2.5 sm:col-span-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink">Customer</h2>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/track" className="transition hover:text-green-800 hover:underline">
                  Track an order
                </Link>
              </li>
              <li>
                <Link href="/orders" className="transition hover:text-green-800 hover:underline">
                  Order history &amp; receipts
                </Link>
              </li>
              <li>
                <Link href="/profile" className="transition hover:text-green-800 hover:underline">
                  Dietary &amp; allergen prefs
                </Link>
              </li>
            </ul>
          </div>

          {/* Partners & Legal (No Admin link) */}
          <div className="col-span-2 space-y-2.5 sm:col-span-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink">Partners &amp; Legal</h2>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/restaurant" className="transition hover:text-green-800 hover:underline">
                  Restaurant Partner Portal
                </Link>
              </li>
              <li>
                <Link href="/partner" className="transition hover:text-green-800 hover:underline">
                  Delivery Partner Portal
                </Link>
              </li>
              <li>
                <Link href="/terms" className="transition hover:text-green-800 hover:underline">
                  Terms &amp; Privacy
                </Link>
              </li>
              <li>
                <Link href="/refunds" className="transition hover:text-green-800 hover:underline">
                  Cancellation &amp; refunds
                </Link>
              </li>
              <li>
                <Link href="/contact" className="transition hover:text-green-800 hover:underline">
                  Contact support
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom hairline bar */}
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
