"use client";

import { useEffect, useState } from "react";
import { flagsApi, type AdminFlag } from "@/lib/api";
import { useFlags } from "@/features/flags";
import { ErrorBox, Spinner } from "@/components/ui";

export default function FlagsPage() {
  const { refresh } = useFlags();
  const [flags, setFlags] = useState<AdminFlag[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    flagsApi.list().then(setFlags).catch(setError);
  }, []);

  async function toggle(f: AdminFlag) {
    setBusy(f.key);
    setError(null);
    try {
      const updated = await flagsApi.set(f.key, !f.enabled);
      setFlags((cur) => cur?.map((x) => (x.key === updated.key ? updated : x)) ?? cur);
      await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  if (!flags) return error ? <ErrorBox error={error} /> : <Spinner label="Loading flags" />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Feature flags</h1>
        <p className="text-sm text-stone-600">
          Changes apply to new requests straight away. Storefront flags take effect when customers next load the app.
        </p>
      </div>
      {error !== null && <ErrorBox error={error} />}
      <ul className="divide-y divide-stone-200 rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
        {flags.map((f) => (
          <li key={f.key} className="flex items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm font-semibold">{f.key}</p>
              <p className="text-sm text-stone-600">{f.description}</p>
              <p className="text-xs text-stone-500">Updated {new Date(f.updatedAt).toLocaleString()}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={f.enabled}
              aria-label={`${f.key} is ${f.enabled ? "on" : "off"}`}
              disabled={busy === f.key}
              onClick={() => toggle(f)}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                f.enabled ? "bg-green-600" : "bg-stone-300"
              }`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
                  f.enabled ? "left-5" : "left-0.5"
                }`}
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
