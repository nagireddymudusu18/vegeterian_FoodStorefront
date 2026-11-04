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

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
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
};

export default nextConfig;
