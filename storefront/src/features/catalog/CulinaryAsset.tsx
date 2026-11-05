"use client";

import { useState } from "react";
import type { MenuItem, Restaurant } from "@/lib/api";
import { formatDistance } from "@/lib/money";
import {
  CURATED_CULINARY_ASSETS,
  resolveMenuItemAsset,
  resolveRestaurantAsset,
  type CulinaryIconKind,
} from "./assets";

export function CulinarySvgArtifact({
  kind,
  className = "h-8 w-8",
}: {
  kind: CulinaryIconKind;
  className?: string;
}) {
  switch (kind) {
    case "dosa":
      return (
        <svg aria-hidden="true" viewBox="0 0 32 32" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 22c5-7 19-7 24 0" />
          <path d="M3 22h26a2 2 0 0 1-2 3H5a2 2 0 0 1-2-3Z" />
          <circle cx="11" cy="14" r="2.2" />
          <circle cx="17" cy="13" r="2.2" />
          <path d="M22 11c1.5 1 2.5 2.5 2.5 4" />
        </svg>
      );
    case "biryani":
      return (
        <svg aria-hidden="true" viewBox="0 0 32 32" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 16h20l-2 9a3 3 0 0 1-3 2H11a3 3 0 0 1-3-2l-2-9Z" />
          <path d="M8 16c1.5-3.5 5-5.5 8-5.5s6.5 2 8 5.5" />
          <path d="M13 7c0 1.5 1.5 1.5 1.5 3M18 6.5c0 1.5 1.5 1.5 1.5 3" />
        </svg>
      );
    case "chaat":
      return (
        <svg aria-hidden="true" viewBox="0 0 32 32" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="6" y="12" width="9" height="8" rx="2" />
          <rect x="17" y="12" width="9" height="8" rx="2" />
          <path d="M4 23h24" />
          <path d="M10 9l1.5 1.5M21 9l-1.5 1.5" />
        </svg>
      );
    case "sweet":
      return (
        <svg aria-hidden="true" viewBox="0 0 32 32" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 18h22a9 9 0 0 1-9 8h-4a9 9 0 0 1-9-8Z" />
          <circle cx="13" cy="15" r="2.5" />
          <circle cx="19" cy="15" r="2.5" />
          <path d="M16 11v1.5" />
        </svg>
      );
    case "beverage":
      return (
        <svg aria-hidden="true" viewBox="0 0 32 32" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 10h12l-1.5 15a2 2 0 0 1-2 1.8h-5a2 2 0 0 1-2-1.8L9 10Z" />
          <path d="M18 5l-2 5" />
          <path d="M8 10h14" />
        </svg>
      );
    case "curry":
    default:
      return (
        <svg aria-hidden="true" viewBox="0 0 32 32" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 15h22l-2 9a4 4 0 0 1-4 3H11a4 4 0 0 1-4-3l-2-9Z" />
          <path d="M3 15h26" />
          <path d="M12 9c0 1.5 1.2 1.8 1.2 3.2M16 8c0 1.5 1.2 1.8 1.2 3.2M20 9c0 1.5 1.2 1.8 1.2 3.2" />
        </svg>
      );
  }
}

export function RestaurantCoverAsset({
  restaurant,
  heightClass = "h-44",
  showDistance = true,
}: {
  restaurant: Restaurant & { imageUrl?: string | null };
  heightClass?: string;
  showDistance?: boolean;
}) {
  const asset = resolveRestaurantAsset(restaurant);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc === asset.src;

  return (
    <div className={`relative w-full overflow-hidden ${heightClass} ${asset.tintBg}`}>
      {!failed ? (
        <img
          src={asset.src}
          alt={asset.alt}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailedSrc(asset.src)}
          style={{ objectPosition: asset.focalPoint }}
          className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-4 text-center">
          <span className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-white/80 shadow-xs ${asset.tintInk}`}>
            <CulinarySvgArtifact kind={asset.icon} className="h-7 w-7" />
          </span>
          <span className={`text-xs font-bold tracking-wide ${asset.tintInk}`}>{restaurant.name}</span>
        </div>
      )}

      {/* Measured contrast scrim for text legibility */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent"
      />

      <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-wide text-white/95 drop-shadow-xs">
          {asset.tag}
        </span>
        {showDistance && restaurant.distanceMeters !== undefined && (
          <span className="shrink-0 rounded-lg bg-white/95 px-2.5 py-1 text-xs font-bold tabular-nums text-ink shadow-xs">
            {formatDistance(restaurant.distanceMeters)}
          </span>
        )}
      </div>
    </div>
  );
}

export function DishThumbnailAsset({
  item,
  restaurantName,
}: {
  item: MenuItem & { imageUrl?: string | null };
  restaurantName?: string;
}) {
  const asset = resolveMenuItemAsset(item, restaurantName);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc === asset.src;

  return (
    <div
      className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl ring-1 ring-stone-200/90 sm:h-24 sm:w-24 ${asset.tintBg}`}
    >
      {!failed ? (
        <img
          src={asset.src}
          alt={asset.alt}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailedSrc(asset.src)}
          style={{ objectPosition: asset.focalPoint }}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className={`flex h-full w-full flex-col items-center justify-center p-2 text-center ${asset.tintInk}`}>
          <CulinarySvgArtifact kind={asset.icon} className="h-7 w-7" />
        </div>
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-1.5 pb-1 pt-3"
      >
        <span className="block truncate text-center text-[10px] font-semibold leading-tight text-white">
          {asset.categoryLabel}
        </span>
      </div>
    </div>
  );
}

export function CulinaryAssetPicker({
  value,
  onChange,
  label = "Dish photo",
}: {
  value: string;
  onChange: (nextUrl: string) => void;
  label?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="block text-xs font-semibold text-stone-700">{label}</span>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-xs font-medium text-stone-600 underline hover:text-ink"
          >
            Use automatic culinary match
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={label}>
        {CURATED_CULINARY_ASSETS.map((preset) => {
          const selected = value === preset.src;
          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(selected ? "" : preset.src)}
              className={`group flex items-center gap-2 rounded-xl border p-1.5 text-left transition ${
                selected
                  ? "border-green-700 bg-green-50/70 ring-2 ring-green-700/20"
                  : "border-stone-200 bg-white hover:border-stone-300"
              }`}
            >
              <img
                src={preset.src}
                alt={preset.alt}
                referrerPolicy="no-referrer"
                className="h-10 w-10 shrink-0 rounded-lg object-cover"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold text-ink">{preset.cuisine}</span>
                <span className="block truncate text-[11px] text-stone-600">{preset.label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
