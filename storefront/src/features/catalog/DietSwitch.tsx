"use client";

import { DIET_OPTIONS, type DietFilter } from "./diet";

export function DietSwitch({ value, onChange }: { value: DietFilter; onChange: (d: DietFilter) => void }) {
  return (
    <div role="radiogroup" aria-label="Diet preference" className="grid grid-cols-4 gap-1 rounded-xl bg-stone-200 p-1">
      {DIET_OPTIONS.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`rounded-lg px-2 py-2.5 text-sm font-semibold transition-colors ${
              active ? "bg-green-700 text-white shadow" : "text-stone-700 hover:bg-white/70"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
