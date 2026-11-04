"use client";

import type { ReactNode } from "react";
import { useRequireAuth } from "@/features/auth";
import { useFlag } from "@/features/flags";
import { Spinner } from "@/components/ui";
import { StaffHeader } from "@/shell/StaffHeader";

/** Delivery partner area. Hidden behind the delivery_module flag (identity-service) and runs against fleet-service. */
export default function PartnerLayout({ children }: { children: ReactNode }) {
  const { status, logout } = useRequireAuth();
  const enabled = useFlag("delivery_module");

  if (status !== "authed") return <Spinner label="Checking access" />;

  return (
    <div className="min-h-screen">
      <StaffHeader area="Partner" homeHref="/partner" bell onLogout={logout} widthClass="max-w-3xl" />
      <main id="main" className="mx-auto w-full max-w-3xl px-4 py-6">
        {enabled ? (
          children
        ) : (
          <div className="card space-y-2 p-6 text-center">
            <h1 className="text-xl font-bold">Delivery partner area is not open yet</h1>
            <p className="text-sm text-stone-600">Check back soon.</p>
          </div>
        )}
      </main>
    </div>
  );
}
