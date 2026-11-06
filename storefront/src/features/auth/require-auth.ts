"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "./auth-context";
import { portalLoginPath, resolvePortalScope } from "./roles";

/**
 * Redirects anonymous visitors to their portal's login screen (?next=<current path>). Returns the auth state.
 * Pass `skip` when the page is deliberately signing the user out and navigating elsewhere, or when rendering a login page.
 */
export function useRequireAuth(skip = false, loginPath?: string) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (skip) return;
    if (auth.status === "anon") {
      const currentPath = pathname || (typeof window !== "undefined" ? window.location.pathname : "/");
      const search = typeof window !== "undefined" ? window.location.search : "";
      const here = currentPath + search;
      const target = loginPath ?? portalLoginPath(resolvePortalScope(currentPath));
      if (currentPath !== target) {
        router.replace(`${target}?next=${encodeURIComponent(here)}`);
      }
    }
  }, [auth.status, skip, loginPath, pathname, router]);

  return auth;
}

