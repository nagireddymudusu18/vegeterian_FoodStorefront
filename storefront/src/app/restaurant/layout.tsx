"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useRequireAuth } from "@/features/auth";
import { identity } from "@/lib/api";
import { Spinner } from "@/components/ui";
import { StaffFooter } from "@/shell/StaffFooter";
import { StaffHeader } from "@/shell/StaffHeader";
import RestaurantLoginPage from "./login/page";

/** Restaurant area. The server scopes every call to the caller's own restaurants; this guard only decides what to render. */
export default function RestaurantLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/restaurant/login";
  const { status, me, logout } = useRequireAuth(isLoginPage, "/restaurant/login");

  if (isLoginPage || status === "anon") {
    return (
      <div className="flex min-h-screen flex-col">
        <div className="flex-1">{isLoginPage ? children : <RestaurantLoginPage />}</div>
        <StaffFooter area="Kitchen" />
      </div>
    );
  }

  if (status === "loading" || !me) {
    return (
      <div className="flex min-h-screen flex-col">
        <div className="flex-1 py-12">
          <Spinner label="Checking kitchen access" />
        </div>
        <StaffFooter area="Kitchen" />
      </div>
    );
  }

  const allowed = me.roles.includes("RESTAURANT") || identity.isAdmin(me);
  const links = allowed
    ? [
        { href: "/restaurant", label: "Orders" },
        { href: "/restaurant/menu", label: "Menu & Availability" },
      ]
    : [];

  const handleLogout = () => {
    logout();
    router.replace("/restaurant/login");
  };

  return (
    <div className="flex min-h-screen flex-col">
      <StaffHeader area="Kitchen" homeHref="/restaurant" links={links} bell onLogout={handleLogout} />
      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        {allowed ? (
          children
        ) : (
          <div className="card space-y-3 p-6 text-center">
            <h1 className="text-xl font-bold">Restaurant access required</h1>
            <p className="text-sm text-stone-600">
              Ask an administrator to link your account to your restaurant, or sign in with your Kitchen Partner credentials.
            </p>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg bg-green-800 px-4 py-2 text-sm font-semibold text-white hover:bg-green-900"
            >
              Switch Kitchen account
            </button>
          </div>
        )}
      </main>
      <StaffFooter area="Kitchen" />
    </div>
  );
}

