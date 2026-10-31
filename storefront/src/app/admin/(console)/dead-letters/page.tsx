"use client";

import { useCallback, useEffect, useState } from "react";
import { deadLettersApi, type DeadLetter, type DeadLetterService } from "@/lib/api";
import { Empty, ErrorBox, Spinner } from "@/components/ui";

const SERVICES: { key: DeadLetterService; label: string }[] = [
  { key: "orders", label: "Orders" },
  { key: "payments", label: "Payments" },
  { key: "fleet", label: "Fleet" },
  { key: "notifications", label: "Notifications" },
];

type Parked = DeadLetter & { service: DeadLetterService };

/** Events another service sent that this one could not apply. Retry applies it again; discard drops it. */
export default function AdminDeadLetters() {
  const [items, setItems] = useState<Parked[] | null>(null);
  const [unreachable, setUnreachable] = useState<string[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const results = await Promise.allSettled(SERVICES.map((s) => deadLettersApi.list(s.key)));
    const all: Parked[] = [];
    const failed: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") all.push(...r.value.items.map((d) => ({ ...d, service: SERVICES[i].key })));
      else failed.push(SERVICES[i].label);
    });
    setItems(all.sort((a, b) => a.parkedAt.localeCompare(b.parkedAt)));
    setUnreachable(failed);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(d: Parked, action: "retry" | "discard") {
    const key = `${d.service}:${d.id}`;
    setBusy(key);
    setError(null);
    try {
      await (action === "retry" ? deadLettersApi.retry(d.service, d.id) : deadLettersApi.discard(d.service, d.id));
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dead letters</h1>
        <p className="text-sm text-stone-600">
          Events that a service kept failing to apply (or that were malformed) wait here, so nothing is lost and the rest of the feed keeps
          moving. Retry after fixing the cause; discard only if the event is no longer needed.
        </p>
      </div>

      {error !== null && <ErrorBox error={error} />}
      {unreachable.length > 0 && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Could not read: {unreachable.join(", ")}.
        </p>
      )}

      {!items ? (
        <Spinner label="Loading dead letters" />
      ) : items.length === 0 ? (
        <Empty>Nothing is parked. All services are keeping up.</Empty>
      ) : (
        <ul className="space-y-3">
          {items.map((d) => {
            const key = `${d.service}:${d.id}`;
            return (
              <li key={key} className="space-y-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-stone-900 px-2.5 py-1 text-xs font-semibold text-white">
                    {SERVICES.find((s) => s.key === d.service)?.label}
                  </span>
                  <span className="font-semibold">{d.eventType ?? "Unknown event"}</span>
                  <span className="text-xs text-stone-500">
                    from {d.source} #{d.eventId} · {d.attempts} attempt{d.attempts === 1 ? "" : "s"} · parked{" "}
                    {new Date(d.parkedAt).toLocaleString()}
                  </span>
                </div>
                <p className="break-words text-sm text-red-800">{d.error}</p>
                <details className="text-xs text-stone-600">
                  <summary className="cursor-pointer">Payload</summary>
                  <pre className="mt-1 overflow-x-auto rounded-lg bg-stone-100 p-2">{JSON.stringify(d.payload, null, 2)}</pre>
                </details>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => act(d, "retry")}
                    className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60"
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => act(d, "discard")}
                    className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100 disabled:opacity-60"
                  >
                    Discard
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
