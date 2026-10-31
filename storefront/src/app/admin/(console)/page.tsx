"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { adminRestaurants, deadLettersApi, flagsApi, type AdminFlag } from "@/lib/api";
import { ErrorBox, Spinner } from "@/components/ui";

interface Summary {
  restaurants: number | null;
  withoutOwner: number;
  parked: number | null;
}

const SERVICES = ["orders", "payments", "fleet", "notifications"] as const;

function Tile({ href, label, children, action, alert }: { href: string; label: string; children: React.ReactNode; action: string; alert?: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-2xl bg-white p-5 shadow-sm ring-1 hover:ring-green-600 ${alert ? "ring-red-400" : "ring-stone-200"}`}
    >
      <p className="text-sm text-stone-600">{label}</p>
      <div className="mt-1">{children}</div>
      <p className="mt-2 text-sm text-green-800">{action}</p>
    </Link>
  );
}

export default function AdminDashboard() {
  const [flags, setFlags] = useState<AdminFlag[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    flagsApi.list().then(setFlags).catch(setError);
    // The tiles below are best effort: a service that does not answer shows a dash instead of breaking the page.
    void (async () => {
      const [restaurants, ...dead] = await Promise.allSettled([
        adminRestaurants.list(),
        ...SERVICES.map((s) => deadLettersApi.list(s)),
      ]);
      const list = restaurants.status === "fulfilled" ? restaurants.value : null;
      const counts = dead.map((d) => (d.status === "fulfilled" ? d.value.open : null));
      setSummary({
        restaurants: list ? list.length : null,
        withoutOwner: list ? list.filter((r) => !r.ownerUserId).length : 0,
        parked: counts.some((c) => c === null) ? null : counts.reduce<number>((a, c) => a + (c ?? 0), 0),
      });
    })();
  }, []);

  if (error) return <ErrorBox error={error} />;
  if (!flags) return <Spinner label="Loading dashboard" />;

  const on = flags.filter((f) => f.enabled).length;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile href="/admin/flags" label="Feature flags" action="Manage flags">
          <p className="text-3xl font-bold">
            {on} <span className="text-base font-medium text-stone-500">of {flags.length} on</span>
          </p>
        </Tile>
        <Tile href="/admin/restaurants" label="Restaurants" action="Link owners">
          <p className="text-3xl font-bold">
            {summary?.restaurants ?? "-"}
            {summary && summary.withoutOwner > 0 && (
              <span className="ml-2 text-base font-medium text-amber-800">{summary.withoutOwner} without an owner</span>
            )}
          </p>
        </Tile>
        <Tile href="/admin/dead-letters" label="Dead letters" action="Review parked events" alert={!!summary?.parked}>
          <p className="text-3xl font-bold">
            {summary?.parked ?? "-"} <span className="text-base font-medium text-stone-500">waiting</span>
          </p>
        </Tile>
        <Tile href="/admin/deliveries" label="Deliveries" action="Open deliveries">
          <p className="text-sm text-stone-700">See every delivery and assign a partner by hand.</p>
        </Tile>
      </div>
    </div>
  );
}

