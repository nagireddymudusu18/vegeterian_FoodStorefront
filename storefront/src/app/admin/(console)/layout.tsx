"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { rolesFromAccessToken, useAuth } from "@/features/auth";
import { identity } from "@/lib/api";
import { getTokens } from "@/lib/tokens";
import { Spinner } from "@/components/ui";

/**
 * Admin area. The server enforces the role on every /admin API call; this guard only decides what to render.
 * It looks at the roles in the access token: an admin account signed in any way other than the admin
 * sign-in has a token without them, so it is sent to /admin/login.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const { status, me, logout } = useAuth();

  useEffect(() => {
    if (status === "anon") {
      const here = window.location.pathname + window.location.search;
      window.location.replace(`/admin/login?next=${encodeURIComponent(here)}`);
    }
  }, [status]);

  if (status !== "authed" || !me) return <Spinner label="Checking access" />;

  const roles = rolesFromAccessToken(getTokens()?.accessToken);
  if (!roles.includes("ADMIN")) {
    const isAdminAccount = identity.isAdmin(me);
    return (
      <main className="mx-auto max-w-md space-y-3 px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">{isAdminAccount ? "Use the admin sign-in" : "Admins only"}</h1>
        <p className="text-stone-700">
          {isAdminAccount
            ? "Administrators sign in with email and password on the admin sign-in page."
            : "Your account does not have access to the admin area."}
        </p>
        {isAdminAccount && (
          <Link href="/admin/login" className="inline-block font-semibold text-green-800 underline">
            Go to the admin sign-in
          </Link>
        )}
        <div>
          <Link href="/" className="font-semibold text-green-800 underline">
            Back to the store
          </Link>
        </div>
      </main>
    );
  }
  const isMain = roles.includes("SUPER_ADMIN");

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-stone-900 text-stone-100">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/admin" className="text-lg font-extrabold tracking-tight">
            Veggo Eats Admin
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
            <Link href="/admin/restaurants" className="rounded-lg px-3 py-2 hover:bg-stone-800">
              Restaurants
            </Link>
            <Link href="/admin/dead-letters" className="rounded-lg px-3 py-2 hover:bg-stone-800">
              Dead letters
            </Link>
            {isMain && (
              <Link href="/admin/team" className="rounded-lg px-3 py-2 hover:bg-stone-800">
                Team
              </Link>
            )}
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
