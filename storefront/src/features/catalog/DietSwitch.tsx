"use client";

import { DIET_OPTIONS, type DietFilter } from "./diet";

export function DietSwitch({ value, onChange }: { value: DietFilter; onChange: (d: DietFilter) => void }) {
  return (
    <div role="radiogroup" aria-label="Diet preference" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {DIET_OPTIONS.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
              active ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-stone-200 hover:bg-stone-100"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
