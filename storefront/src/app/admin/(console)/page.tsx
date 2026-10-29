"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { flagsApi, type AdminFlag } from "@/lib/api";
import { ErrorBox, Spinner } from "@/components/ui";

export default function AdminDashboard() {
  const [flags, setFlags] = useState<AdminFlag[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    flagsApi.list().then(setFlags).catch(setError);
  }, []);

  if (error) return <ErrorBox error={error} />;
  if (!flags) return <Spinner label="Loading dashboard" />;

  const on = flags.filter((f) => f.enabled).length;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/admin/flags" className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200 hover:ring-green-600">
          <p className="text-sm text-stone-600">Feature flags</p>
          <p className="mt-1 text-3xl font-bold">
            {on} <span className="text-base font-medium text-stone-500">of {flags.length} on</span>
          </p>
          <p className="mt-2 text-sm text-green-800">Manage flags</p>
        </Link>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
          <p className="text-sm text-stone-600">Orders, restaurants and users</p>
          <p className="mt-2 text-sm text-stone-700">Coming next: these screens need admin endpoints in the other services.</p>
        </div>
      </div>
    </div>
  );
}
