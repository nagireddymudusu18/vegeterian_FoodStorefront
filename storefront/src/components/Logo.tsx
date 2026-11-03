import { BRAND } from "@/lib/brand";

/** Leaf on a rounded square, with two turmeric motion lines ("on the go"). */
export function BrandMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <rect width="48" height="48" rx="14" fill="#1b5e3a" />
      <path d="M13 32c0-10 7-17 20-18-.2 12-7 19-17 19-2 0-3-.3-3-1z" fill="#fff" />
      <path d="M15.5 33.5c5-5.5 9.5-9 15-12.5" stroke="#1b5e3a" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <path d="M8 38.5h9M11 42h6" stroke="#e8a317" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <BrandMark />
      <span className="text-xl font-extrabold tracking-tight text-ink">{BRAND.name}</span>
    </span>
  );
}
