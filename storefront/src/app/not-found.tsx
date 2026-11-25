"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  PORTAL_METADATA,
  resolveClientPortalState,
  type PortalScope,
} from "@/lib/portal-isolation";

export default function NotFound() {
  const pathname = usePathname();
  const [portal, setPortal] = useState<PortalScope>("customer");
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    const state = resolveClientPortalState(pathname);
    setPortal(state.lockedPortal ?? state.activePortal);
    setIsLocked(Boolean(state.lockedPortal));
  }, [pathname]);

  const meta = PORTAL_METADATA[portal];

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
        404 · {meta.name}
      </p>
      <h1 className="mt-2 text-2xl font-bold text-ink">Page not found</h1>
      <p className="mt-2 text-sm text-stone-600">
        {isLocked
          ? `This route is not available in the ${meta.name}.`
          : "The page you are looking for does not exist or has moved."}
      </p>
      <Link
        href={meta.homePath}
        className="mt-6 inline-flex items-center rounded-lg bg-green-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-900"
      >
        Back to {meta.shortName} home
      </Link>
    </main>
  );
}
