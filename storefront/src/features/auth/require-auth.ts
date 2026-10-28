"use client";

import { useEffect } from "react";
import { useAuth } from "./auth-context";

/**
 * Redirects anonymous visitors to /login?next=<current path>. Returns the auth state.
 * Pass `skip` when the page is deliberately signing the user out and navigating elsewhere.
 */
export function useRequireAuth(skip = false) {
  const auth = useAuth();
  useEffect(() => {
    if (skip) return;
    if (auth.status === "anon") {
      const here = window.location.pathname + window.location.search;
      window.location.replace(`/login?next=${encodeURIComponent(here)}`);
    }
  }, [auth.status, skip]);
  return auth;
}
