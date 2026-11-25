import { NextResponse, type NextRequest } from "next/server";
import {
  PREVIEW_LOCK_COOKIE,
  evaluatePortalMiddleware,
  resolveLockedPortal,
} from "@/lib/portal-isolation";

export function middleware(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const previewLockCookie = req.cookies.get(PREVIEW_LOCK_COOKIE)?.value ?? null;

  const { lockedPortal, source } = resolveLockedPortal({
    envPortal: process.env.NEXT_PUBLIC_APP_PORTAL,
    host,
    customerHost: process.env.NEXT_PUBLIC_CUSTOMER_HOST,
    previewLockCookie,
  });

  const decision = evaluatePortalMiddleware({
    pathname: req.nextUrl.pathname,
    lockedPortal,
  });

  if (decision.action === "block_404") {
    const blockedUrl = req.nextUrl.clone();
    blockedUrl.pathname = "/__portal_blocked";
    const res = NextResponse.rewrite(blockedUrl, { status: 404 });
    res.headers.set("X-Veggo-Portal", decision.portal);
    res.headers.set("X-Veggo-Portal-Lock", source);
    return res;
  }

  if (decision.action === "rewrite") {
    const rewriteUrl = req.nextUrl.clone();
    rewriteUrl.pathname = decision.destination;
    const res = NextResponse.rewrite(rewriteUrl);
    res.headers.set("X-Veggo-Portal", decision.portal);
    res.headers.set("X-Veggo-Portal-Lock", source);
    return res;
  }

  const res = NextResponse.next();
  res.headers.set("X-Veggo-Portal", decision.portal);
  res.headers.set("X-Veggo-Portal-Lock", source);
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|assets/|robots.txt|sitemap.xml).*)",
  ],
};
