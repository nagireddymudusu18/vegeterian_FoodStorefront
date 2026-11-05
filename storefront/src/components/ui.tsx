"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { errorMessage, errorReference } from "@/lib/api";
import { evaluatePasswordStrength, type CheckoutProgressStep } from "@/features/ux/form-validation";

/** Compact inline spinner for inside buttons during async operations. */
export function ButtonSpinner({ className = "h-4 w-4 border-white/35 border-t-white" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 animate-spin rounded-full border-2 ${className}`}
    />
  );
}

export function Spinner({ label = "Loading", detail }: { label?: string; detail?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-stone-200/80 bg-white/80 px-6 py-10 text-center text-stone-700 shadow-xs"
    >
      <div className="relative flex h-9 w-9 items-center justify-center">
        <span
          className="absolute inset-0 animate-ping rounded-full bg-green-600/15"
          aria-hidden="true"
        />
        <span
          className="h-6 w-6 animate-spin rounded-full border-2 border-stone-300 border-t-green-700"
          aria-hidden="true"
        />
      </div>
      <div className="space-y-0.5">
        <p className="text-sm font-bold text-stone-900">{label}…</p>
        {detail && <p className="text-xs text-stone-500">{detail}</p>}
      </div>
    </div>
  );
}

/** Multi-stage progressive loader card with animated progress bar and step checklist. */
export function ProgressiveLoader({
  headline,
  subline,
  percent,
  steps,
}: {
  headline: string;
  subline?: string;
  percent: number;
  steps: CheckoutProgressStep[];
}) {
  return (
    <section
      role="status"
      aria-live="polite"
      className="overflow-hidden rounded-2xl border border-green-300 bg-gradient-to-br from-green-50/90 via-white to-amber-50/50 p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-green-300 border-t-green-800"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-extrabold text-stone-900">{headline}</p>
            {subline && <p className="text-xs text-stone-600">{subline}</p>}
          </div>
        </div>
        <span className="rounded-full bg-green-800 px-2.5 py-0.5 font-mono text-xs font-bold tabular-nums text-white">
          {percent}%
        </span>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-stone-200" aria-hidden="true">
        <div
          className="h-full rounded-full bg-gradient-to-r from-green-700 via-green-600 to-amber-500 transition-all duration-500"
          style={{ width: `${Math.max(10, Math.min(100, percent))}%` }}
        />
      </div>

      {steps.length > 0 && (
        <ol className="mt-3.5 grid gap-2 sm:grid-cols-3">
          {steps.map((s, idx) => {
            const done = s.status === "completed";
            const active = s.status === "active";
            return (
              <li
                key={s.id}
                className={`rounded-xl border p-2.5 text-xs transition-colors ${
                  done
                    ? "border-green-200 bg-green-50/80 text-green-950"
                    : active
                      ? "border-green-600 bg-white text-stone-900 shadow-xs ring-1 ring-green-600/20"
                      : "border-stone-200 bg-stone-50/70 text-stone-500"
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold">
                  <span
                    aria-hidden="true"
                    className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold ${
                      done
                        ? "bg-green-700 text-white"
                        : active
                          ? "bg-amber-500 text-stone-950"
                          : "bg-stone-200 text-stone-600"
                    }`}
                  >
                    {done ? "✓" : idx + 1}
                  </span>
                  <span>{s.label}</span>
                </div>
                <p className="mt-1 text-[11px] leading-snug opacity-85">{s.detail}</p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** Live password strength meter and requirement checklist for account creation forms. */
export function PasswordStrengthMeter({ password }: { password: string }) {
  const res = evaluatePasswordStrength(password);
  const barColors = [
    "bg-stone-200",
    "bg-red-500",
    "bg-amber-500",
    "bg-green-600",
    "bg-green-700",
  ];
  const activeColor = barColors[res.score] ?? "bg-stone-200";

  return (
    <div className="mt-2 space-y-1.5 rounded-xl border border-stone-200/80 bg-stone-50/80 p-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-stone-700">Password strength</span>
        <span
          className={`font-bold ${
            res.score >= 3
              ? "text-green-800"
              : res.score === 2
                ? "text-amber-800"
                : res.score === 1
                  ? "text-red-700"
                  : "text-stone-500"
          }`}
        >
          {res.label}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
        {[1, 2, 3, 4].map((level) => (
          <span
            key={level}
            className={`h-1.5 rounded-full transition-colors duration-200 ${
              res.score >= level ? activeColor : "bg-stone-200"
            }`}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5 text-[11px]">
        <li className={res.hasMinLength ? "font-semibold text-green-800" : "text-stone-500"}>
          {res.hasMinLength ? "✓" : "○"} 8+ characters
        </li>
        <li className={res.hasLetter ? "font-semibold text-green-800" : "text-stone-500"}>
          {res.hasLetter ? "✓" : "○"} Contains a letter
        </li>
        <li className={res.hasNumber ? "font-semibold text-green-800" : "text-stone-500"}>
          {res.hasNumber ? "✓" : "○"} Contains a number
        </li>
      </ul>
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const reference = errorReference(error);
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50/95 p-4 text-sm text-red-900 shadow-xs"
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-200 text-xs font-extrabold text-red-900"
        >
          !
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug">{errorMessage(error)}</p>
          {reference && (
            <p className="mt-1 text-xs text-red-800">
              Reference: {reference} (quote this if you contact support)
            </p>
          )}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-red-800"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 p-8 text-center text-stone-600">
      {children}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      className="m-auto w-[min(92vw,26rem)] rounded-2xl p-0 shadow-xl ring-1 ring-stone-200"
    >
      <div className="p-5">
        <h2 id="confirm-title" className="text-lg font-bold text-stone-900">
          {title}
        </h2>
        <div className="mt-2 text-sm text-stone-700">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-100 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
              destructive ? "bg-red-700 hover:bg-red-800" : "bg-green-700 hover:bg-green-800"
            }`}
          >
            {busy && <ButtonSpinner />}
            {busy ? "Please wait..." : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
