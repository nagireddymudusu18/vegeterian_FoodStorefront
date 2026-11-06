"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useRequireAuth } from "@/features/auth";
import { useFlag } from "@/features/flags";
import { Spinner } from "@/components/ui";
import { StaffFooter } from "@/shell/StaffFooter";
import { StaffHeader } from "@/shell/StaffHeader";
import PartnerLoginPage from "./login/page";

/** Delivery partner area. Hidden behind the delivery_module flag (identity-service) and runs against fleet-service. */
export default function PartnerLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/partner/login";
  const { status, logout } = useRequireAuth(isLoginPage, "/partner/login");
  const enabled = useFlag("delivery_module");

  if (isLoginPage || status === "anon") {
    return (
      <div className="flex min-h-screen flex-col">
        <div className="flex-1">{isLoginPage ? children : <PartnerLoginPage />}</div>
        <StaffFooter area="Partner" widthClass="max-w-3xl" />
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-screen flex-col">
        <div className="flex-1 py-12">
          <Spinner label="Checking fleet access" />
        </div>
        <StaffFooter area="Partner" widthClass="max-w-3xl" />
      </div>
    );
  }

  const links = [{ href: "/partner", label: "Dispatch & Earnings" }];

  const handleLogout = () => {
    logout();
    router.replace("/partner/login");
  };

  return (
    <div className="flex min-h-screen flex-col">
      <StaffHeader
        area="Partner"
        homeHref="/partner"
        links={links}
        bell
        onLogout={handleLogout}
        widthClass="max-w-3xl"
      />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {enabled ? (
          children
        ) : (
          <div className="card space-y-2 p-6 text-center">
            <h1 className="text-xl font-bold">Delivery partner area is not open yet</h1>
            <p className="text-sm text-stone-600">Check back soon.</p>
          </div>
        )}
      </main>
      <StaffFooter area="Partner" widthClass="max-w-3xl" />
    </div>
  );
}

