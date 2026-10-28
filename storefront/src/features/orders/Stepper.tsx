import { LIFECYCLE, statusLabel, stepState } from "./orders";

export function Stepper({ status }: { status: string }) {
  return (
    <ol className="space-y-0" aria-label="Order progress">
      {LIFECYCLE.map((step, i) => {
        const s = stepState(status, step);
        return (
          <li key={step} className="flex gap-3" aria-current={s === "current" ? "step" : undefined}>
            <div className="flex flex-col items-center">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  s === "done"
                    ? "bg-green-700 text-white"
                    : s === "current"
                      ? "bg-green-100 text-green-900 ring-2 ring-green-700"
                      : "bg-stone-200 text-stone-500"
                }`}
              >
                {s === "done" ? "✓" : i + 1}
              </span>
              {i < LIFECYCLE.length - 1 && (
                <span className={`h-6 w-0.5 ${s === "done" ? "bg-green-700" : "bg-stone-300"}`} aria-hidden="true" />
              )}
            </div>
            <div className={`pb-4 pt-1 text-sm ${s === "upcoming" ? "text-stone-500" : "font-medium"}`}>
              {statusLabel(step)}
              {s === "current" && <span className="sr-only"> (current step)</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
