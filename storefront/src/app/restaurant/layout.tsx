"use client";

import type { ReactNode } from "react";
import { useRequireAuth } from "@/features/auth";
import { identity } from "@/lib/api";
import { Spinner } from "@/components/ui";
import { StaffHeader } from "@/shell/StaffHeader";

/** Restaurant area. The server scopes every call to the caller's own restaurants; this guard only decides what to render. */
export default function RestaurantLayout({ children }: { children: ReactNode }) {
  const { status, me, logout } = useRequireAuth();

  if (status !== "authed" || !me) return <Spinner label="Checking access" />;

  const allowed = me.roles.includes("RESTAURANT") || identity.isAdmin(me);
  return (
    <div className="min-h-screen">
      <StaffHeader area="Kitchen" homeHref="/restaurant" bell onLogout={logout} />
      <main id="main" className="mx-auto w-full max-w-4xl px-4 py-6">
        {allowed ? (
          children
        ) : (
          <div className="card space-y-2 p-6 text-center">
            <h1 className="text-xl font-bold">Restaurant access required</h1>
            <p className="text-sm text-stone-600">Ask an admin to link your account to your restaurant.</p>
          </div>
        )}
      </main>
    </div>
  );
}
