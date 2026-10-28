"use client";

import { useCallback, useEffect, useState } from "react";
import { useChangeStream } from "@/lib/use-change-stream";
import { fleetApi, type Delivery, type Partner } from "@/lib/api";
import { Empty, ErrorBox, Spinner } from "@/components/ui";

export default function AdminDeliveries() {
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, p] = await Promise.all([fleetApi.admin.deliveries(), fleetApi.admin.partners()]);
      setDeliveries(d);
      setPartners(p);
    } catch (e) {
      setError(e);
    }
  }, []);

  const live = useChangeStream("/api/fleet/fleet/admin/stream", true, () => void load());

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), live ? 60_000 : 5000);
    return () => clearInterval(t);
  }, [load, live]);

  async function assign(orderId: string) {
    const partnerId = choice[orderId];
    if (!partnerId) return;
    setBusy(orderId);
    setError(null);
    try {
      await fleetApi.admin.assign(orderId, partnerId);
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  if (!deliveries) return error ? <ErrorBox error={error} /> : <Spinner label="Loading deliveries" />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Deliveries</h1>
      {error != null && <ErrorBox error={error} />}
      {deliveries.length === 0 ? (
        <Empty>No deliveries yet.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 text-stone-600">
              <tr>
                <th className="p-3">Order</th>
                <th className="p-3">Restaurant</th>
                <th className="p-3">Status</th>
                <th className="p-3">Partner</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.orderId} className="border-b border-stone-100">
                  <td className="p-3 font-semibold">#{d.orderNumber}</td>
                  <td className="p-3">{d.restaurantName ?? "-"}</td>
                  <td className="p-3">{d.status}</td>
                  <td className="p-3">
                    {d.status === "AVAILABLE" ? (
                      <div className="flex gap-2">
                        <select
                          aria-label={`Partner for order ${d.orderNumber}`}
                          value={choice[d.orderId] ?? ""}
                          onChange={(e) => setChoice((c) => ({ ...c, [d.orderId]: e.target.value }))}
                          className="rounded-lg border border-stone-300 px-2 py-1"
                        >
                          <option value="">Choose partner</option>
                          {partners.map((p) => (
                            <option key={p.userId} value={p.userId}>
                              {p.name} ({p.online ? "online" : "offline"}, {p.activeDeliveries} active)
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!choice[d.orderId] || busy === d.orderId}
                          onClick={() => assign(d.orderId)}
                          className="rounded-lg bg-stone-900 px-3 py-1 font-semibold text-white disabled:opacity-50"
                        >
                          Assign
                        </button>
                      </div>
                    ) : (
                      (partners.find((p) => p.userId === d.partnerId)?.name ?? "-")
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
