import type { MenuItem, Restaurant } from "@/lib/api";
import { certificationTier } from "./diet";

export function VegMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex h-4 w-4 items-center justify-center rounded-sm border-2 border-green-700 ${className}`}
      aria-hidden="true"
    >
      <span className="h-2 w-2 rounded-full bg-green-700" />
    </span>
  );
}

export function DietBadges({ item }: { item: Pick<MenuItem, "isPureVeg" | "isVegan" | "isJain"> }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {item.isPureVeg && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-800">
          <VegMark /> Veg
        </span>
      )}
      {item.isVegan && (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
          <span aria-hidden="true">🌿</span> Vegan
        </span>
      )}
      {item.isJain && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          Jain
        </span>
      )}
      {!item.isPureVeg && !item.isVegan && !item.isJain && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-800">
          <span
            className="inline-flex h-4 w-4 items-center justify-center rounded-sm border-2 border-red-700"
            aria-hidden="true"
          >
            <span className="h-2 w-2 rounded-full bg-red-700" />
          </span>
          Non-veg
        </span>
      )}
    </span>
  );
}

export function CertBadge({ level }: { level: Restaurant["kitchenCertificationLevel"] }) {
  const tier = certificationTier(level);
  if (tier === 1) {
    return (
      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
        Tier 1: exclusive veg kitchen
      </span>
    );
  }
  if (tier === 2) {
    return (
      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
        Tier 2: segregated veg kitchen
      </span>
    );
  }
  return null;
}

export function OpenBadge({ open }: { open: boolean }) {
  return open ? (
    <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-200">Open</span>
  ) : (
    <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-600">Closed</span>
  );
}
