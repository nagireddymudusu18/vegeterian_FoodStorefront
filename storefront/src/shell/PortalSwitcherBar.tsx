"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  PORTAL_METADATA,
  PORTAL_SCOPES,
  PREVIEW_LOCK_COOKIE,
  parsePortalEnv,
  resolveClientPortalState,
  type PortalLockSource,
  type PortalScope,
} from "@/lib/portal-isolation";
import { getAuthenticatedPortals, subscribeTokens } from "@/lib/tokens";

const EMPTY_AUTH: Record<PortalScope, boolean> = {
  customer: false,
  restaurant: false,
  partner: false,
  admin: false,
};

function setPreviewLockCookie(portal: PortalScope | null) {
  if (typeof document === "undefined") return;
  if (portal) {
    document.cookie = `${PREVIEW_LOCK_COOKIE}=${encodeURIComponent(portal)}; Path=/; SameSite=Lax; Max-Age=86400`;
  } else {
    document.cookie = `${PREVIEW_LOCK_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0`;
  }
}

/**
 * Compact non-sticky Storefront Switcher Bar for local development and single-port cloud previews.
 * Automatically hidden in production whenever NEXT_PUBLIC_APP_PORTAL or a dedicated subdomain host locks the app.
 */
export function PortalSwitcherBar() {
  const pathname = usePathname();
  const router = useRouter();
  const envSetting = parsePortalEnv(process.env.NEXT_PUBLIC_APP_PORTAL);

  const [mounted, setMounted] = useState(false);
  const [activePortal, setActivePortal] = useState<PortalScope>("customer");
  const [lockedPortal, setLockedPortal] = useState<PortalScope | null>(null);
  const [lockSource, setLockSource] = useState<PortalLockSource>("none");
  const [showBar, setShowBar] = useState(false);
  const [authedMap, setAuthedMap] = useState<Record<PortalScope, boolean>>(EMPTY_AUTH);

  const syncState = useCallback(() => {
    const state = resolveClientPortalState(pathname);
    setActivePortal(state.activePortal);
    setLockedPortal(state.lockedPortal);
    setLockSource(state.lockSource);
    setShowBar(state.showDevSwitcher);
    setAuthedMap(getAuthenticatedPortals());
  }, [pathname]);

  useEffect(() => {
    setMounted(true);
    syncState();
    return subscribeTokens(() => {
      setAuthedMap(getAuthenticatedPortals());
    });
  }, [syncState]);

  // Never render when locked at build/runtime via NEXT_PUBLIC_APP_PORTAL
  if (envSetting !== "all") return null;
  if (!mounted || !showBar) return null;

  const isPreviewLocked = lockSource === "preview_lock" && lockedPortal !== null;

  const handleTogglePreviewLock = () => {
    if (isPreviewLocked) {
      setPreviewLockCookie(null);
      syncState();
      router.refresh();
    } else {
      const target = activePortal;
      setPreviewLockCookie(target);
      syncState();
      router.refresh();
    }
  };

  return (
    <div
      role="region"
      aria-label="Storefront switcher"
      className="border-b border-stone-800 bg-stone-950 text-stone-100"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 overflow-x-auto px-3 py-1.5 text-xs sm:gap-3 sm:px-4">
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="hidden whitespace-nowrap font-semibold tracking-tight text-stone-300 sm:inline">
            Storefronts
          </span>
          <span aria-hidden="true" className="hidden text-stone-700 sm:inline">
            /
          </span>

          {isPreviewLocked ? (
            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className="font-semibold text-amber-300">
                Locked to {PORTAL_METADATA[lockedPortal].name}
              </span>
              <span aria-hidden="true" className="hidden text-stone-600 md:inline">
                ·
              </span>
              <span className="hidden text-stone-400 md:inline">
                Other portal routes return 404 ({PORTAL_METADATA[lockedPortal].productionDomainExample})
              </span>
            </div>
          ) : (
            <nav aria-label="Switch active storefront" className="flex items-center gap-1">
              {PORTAL_SCOPES.map((scope) => {
                const meta = PORTAL_METADATA[scope];
                const isActive = activePortal === scope;
                const isSignedIn = authedMap[scope];
                return (
                  <Link
                    key={scope}
                    href={meta.homePath}
                    aria-current={isActive ? "page" : undefined}
                    title={`${meta.name} — Prod domain: ${meta.productionDomainExample}`}
                    className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 transition-colors sm:px-2.5 ${
                      isActive
                        ? "bg-white font-semibold text-stone-950"
                        : "text-stone-300 hover:bg-stone-800 hover:text-white"
                    }`}
                  >
                    {scope === "partner" ? (
                      <>
                        <span className="sm:hidden">Partner</span>
                        <span className="hidden sm:inline">{meta.shortName}</span>
                      </>
                    ) : (
                      <span>{meta.shortName}</span>
                    )}
                    {isSignedIn && (
                      <span
                        className={`text-[11px] ${
                          isActive ? "text-green-800" : "text-emerald-400"
                        }`}
                      >
                        · Signed in
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden whitespace-nowrap font-mono text-[11px] text-stone-400 lg:inline">
            {PORTAL_METADATA[activePortal].productionDomainExample}
          </span>
          <button
            type="button"
            onClick={handleTogglePreviewLock}
            className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-1 font-medium transition-colors sm:px-2.5 ${
              isPreviewLocked
                ? "border-amber-400/60 bg-amber-400/15 text-amber-200 hover:bg-amber-400/25"
                : "border-stone-700 bg-stone-900 text-stone-200 hover:border-stone-500 hover:text-white"
            }`}
          >
            <span className="sm:hidden">{isPreviewLocked ? "Unlock" : "Lock"}</span>
            <span className="hidden sm:inline">
              {isPreviewLocked ? "Unlock all apps" : "Test prod lock"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
