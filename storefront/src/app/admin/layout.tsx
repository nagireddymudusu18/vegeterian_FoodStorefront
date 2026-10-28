"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useRequireAuth } from "@/features/auth";
import { identity } from "@/lib/api";
import { Spinner } from "@/components/ui";

/** Admin area. The server enforces ADMIN on every /admin API call; this guard only decides what to render. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const { status, me, logout } = useRequireAuth();

  if (status !== "authed" || !me) return <Spinner label="Checking access" />;

  if (!identity.isAdmin(me)) {
    return (
      <main className="mx-auto max-w-md space-y-3 px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Admins only</h1>
        <p className="text-stone-700">Your account does not have access to the admin area.</p>
        <Link href="/" className="font-semibold text-green-800 underline">
          Back to the store
        </Link>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-stone-900 text-stone-100">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/admin" className="text-lg font-extrabold tracking-tight">
            FoodApp Admin
          </Link>
          <nav aria-label="Admin" className="flex gap-1 text-sm">
            <Link href="/admin" className="rounded-lg px-3 py-2 hover:bg-stone-800">
              Dashboard
            </Link>
            <Link href="/admin/flags" className="rounded-lg px-3 py-2 hover:bg-stone-800">
              Feature flags
            </Link>
            <Link href="/admin/deliveries" className="rounded-lg px-3 py-2 hover:bg-stone-800">
              Deliveries
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <Link href="/" className="rounded-lg px-3 py-2 hover:bg-stone-800">
              View store
            </Link>
            <button type="button" onClick={logout} className="rounded-lg px-3 py-2 hover:bg-stone-800">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
