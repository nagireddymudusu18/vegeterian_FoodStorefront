import path from "node:path";
import { fileURLToPath } from "node:url";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PRIVATE_SOURCES = [
  "/admin",
  "/partner",
  "/restaurant",
  "/cart",
  "/checkout",
  "/orders",
  "/profile",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/track",
  "/notifications",
];

/** @type {(phase: string) => import('next').NextConfig} */
const nextConfig = (phase) => ({
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next/dev" : ".next/prod",
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, ".."),
  devIndicators: false,
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    const noindex = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
    // Without NEXT_PUBLIC_ALLOW_INDEXING=true (sandbox) nothing is indexable; private areas never are.
    const sources =
      process.env.NEXT_PUBLIC_ALLOW_INDEXING === "true"
        ? PRIVATE_SOURCES.flatMap((p) => [p, `${p}/:path*`])
        : ["/:path*"];
    return sources.map((source) => ({ source, headers: noindex }));
  },
});

export default nextConfig;
