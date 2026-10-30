"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useRequireAuth } from "@/features/auth";
import { NotificationBell } from "@/features/notifications";
import { useFlag } from "@/features/flags";
import { Spinner } from "@/components/ui";

/** Delivery partner area. Hidden behind the delivery_module flag (identity-service) and runs against fleet-service. */
export default function PartnerLayout({ children }: { children: ReactNode }) {
  const { status, logout } = useRequireAuth();
  const enabled = useFlag("delivery_module");

  if (status !== "authed") return <Spinner label="Checking access" />;

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-emerald-800 text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3">
          <Link href="/partner" className="text-lg font-extrabold tracking-tight">
            Veggo Eats Partner
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell tone="dark" />
            <button type="button" onClick={logout} className="rounded-lg px-3 py-2 text-sm hover:bg-emerald-700">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-3xl px-4 py-6">
        {enabled ? (
          children
        ) : (
          <div className="space-y-2 rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-stone-200">
            <h1 className="text-xl font-bold">Delivery partner area is not open yet</h1>
            <p className="text-sm text-stone-600">Check back soon.</p>
          </div>
        )}
      </main>
    </div>
  );
}
