"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { rolesFromAccessToken, useAuth } from "@/features/auth";
import { deadLettersApi, identity, type DeadLetterService } from "@/lib/api";
import { getTokens } from "@/lib/tokens";
import { Spinner } from "@/components/ui";
import { StaffHeader } from "@/shell/StaffHeader";

const DEAD_LETTER_SERVICES: DeadLetterService[] = ["orders", "payments", "fleet", "notifications"];

/**
 * Admin area. The server enforces the role on every /admin API call; this guard only decides what to render.
 * It looks at the roles in the access token: an admin account signed in any way other than the admin
 * sign-in has a token without them, so it is sent to /admin/login.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const { status, me, logout } = useAuth();
  const pathname = usePathname();
  const [parkedCount, setParkedCount] = useState(0);
  const [parkedServices, setParkedServices] = useState<string[]>([]);

  useEffect(() => {
    if (status === "anon") {
      const here = window.location.pathname + window.location.search;
      window.location.replace(`/admin/login?next=${encodeURIComponent(here)}`);
    }
  }, [status]);

  const roles = rolesFromAccessToken(getTokens()?.accessToken);
  const isAdminSession = status === "authed" && !!me && roles.includes("ADMIN");

  useEffect(() => {
    if (!isAdminSession) return;
    let active = true;
    const checkDeadLetters = async () => {
      const results = await Promise.allSettled(DEAD_LETTER_SERVICES.map((s) => deadLettersApi.list(s)));
      if (!active) return;
      let total = 0;
      const affected: string[] = [];
      results.forEach((r, i) => {
        if (r.status === "fulfilled" && r.value.open > 0) {
          total += r.value.open;
          affected.push(`${DEAD_LETTER_SERVICES[i]} (${r.value.open})`);
        }
      });
      setParkedCount(total);
      setParkedServices(affected);
    };
    void checkDeadLetters();
    const timer = setInterval(() => void checkDeadLetters(), 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [isAdminSession, pathname]);

  if (status !== "authed" || !me) return <Spinner label="Checking access" />;

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
  const links = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/flags", label: "Feature flags" },
    { href: "/admin/deliveries", label: "Deliveries" },
    { href: "/admin/restaurants", label: "Restaurants" },
    { href: "/admin/refunds", label: "Refunds" },
    { href: "/admin/dead-letters", label: "Dead letters", badge: parkedCount },
    { href: "/admin/team", label: "Users & Roles" },
  ];

  return (
    <div className="min-h-screen">
      <StaffHeader area="Admin" homeHref="/admin" links={links} onLogout={logout} storeLabel="View store" widthClass="max-w-6xl" />
      <main id="main" className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6">
        {parkedCount > 0 && pathname !== "/admin/dead-letters" && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
          >
            <span>
              <strong>Dead-letter alert:</strong> {parkedCount} event{parkedCount === 1 ? " is" : "s are"} parked across{" "}
              <strong>{parkedServices.join(", ")}</strong>.
            </span>
            <Link href="/admin/dead-letters" className="shrink-0 font-bold text-red-900 underline">
              Review dead letters &rarr;
            </Link>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
