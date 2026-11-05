"use client";

import { useEffect } from "react";
import { useAuth } from "./auth-context";
import { portalLoginPath, resolvePortalScope } from "./roles";

/**
 * Redirects anonymous visitors to their portal's login screen (?next=<current path>). Returns the auth state.
 * Pass `skip` when the page is deliberately signing the user out and navigating elsewhere, or when rendering a login page.
 */
export function useRequireAuth(skip = false, loginPath?: string) {
  const auth = useAuth();
  useEffect(() => {
    if (skip) return;
    if (auth.status === "anon") {
      const pathname = window.location.pathname;
      const here = pathname + window.location.search;
      const target = loginPath ?? portalLoginPath(resolvePortalScope(pathname));
      window.location.replace(`${target}?next=${encodeURIComponent(here)}`);
    }
  }, [auth.status, skip, loginPath]);
  return auth;
}

