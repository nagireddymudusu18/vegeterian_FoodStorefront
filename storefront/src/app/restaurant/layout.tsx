"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useRequireAuth } from "@/features/auth";
import { NotificationBell } from "@/features/notifications";
import { identity } from "@/lib/api";
import { Spinner } from "@/components/ui";

/** Restaurant area. The server scopes every call to the caller's own restaurants; this guard only decides what to render. */
export default function RestaurantLayout({ children }: { children: ReactNode }) {
  const { status, me, logout } = useRequireAuth();

  if (status !== "authed" || !me) return <Spinner label="Checking access" />;

  const allowed = me.roles.includes("RESTAURANT") || identity.isAdmin(me);
  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-orange-800 text-white">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
          <Link href="/restaurant" className="text-lg font-extrabold tracking-tight">
            Veggo Eats Kitchen
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <Link href="/" className="rounded-lg px-3 py-2 text-sm hover:bg-orange-700">
              Storefront
            </Link>
            <NotificationBell tone="dark" />
            <button type="button" onClick={logout} className="rounded-lg px-3 py-2 text-sm hover:bg-orange-700">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-4xl px-4 py-6">
        {allowed ? (
          children
        ) : (
          <div className="space-y-2 rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-stone-200">
            <h1 className="text-xl font-bold">Restaurant access required</h1>
            <p className="text-sm text-stone-600">Ask an admin to link your account to your restaurant.</p>
          </div>
        )}
      </main>
    </div>
  );
}
