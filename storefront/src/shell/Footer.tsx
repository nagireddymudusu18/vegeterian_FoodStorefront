import Link from "next/link";
import { BRAND } from "@/lib/brand";

export function Footer() {
  return (
    <footer className="mt-12 border-t border-stone-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-6 text-sm text-stone-600 sm:flex-row sm:items-center">
        <p>
          <span className="font-bold text-green-800">{BRAND.name}</span> · {BRAND.tagline}
        </p>
        <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-1 sm:ml-auto">
          <Link href="/terms" className="hover:underline">
            Terms
          </Link>
          <Link href="/privacy" className="hover:underline">
            Privacy
          </Link>
          <Link href="/refunds" className="hover:underline">
            Cancellation &amp; refunds
          </Link>
          <Link href="/contact" className="hover:underline">
            Contact
          </Link>
        </nav>
      </div>
    </footer>
  );
}
