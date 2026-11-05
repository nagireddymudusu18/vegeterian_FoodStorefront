import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import type { Organization, WebSite, WithContext } from "schema-dts";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";
import { Providers } from "@/shell/Providers";
import { BRAND } from "@/lib/brand";
import { indexingEnabled, jsonLd, siteUrl } from "@/lib/seo";

const DESCRIPTION = "Veggo Eats delivers pure veg, vegan and Jain food from certified kitchens. Veg, on the go.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Veggo Eats: Veg, on the go.", template: "%s | Veggo Eats" },
  description: DESCRIPTION,
  applicationName: BRAND.name,
  alternates: { canonical: "./" },
  robots: indexingEnabled() ? { index: true, follow: true } : { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: BRAND.name,
    locale: "en_IN",
    title: `${BRAND.name}: ${BRAND.tagline}`,
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: `${BRAND.name}: ${BRAND.tagline}`, description: DESCRIPTION },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1b5e3a" };

const organization: WithContext<Organization> = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: BRAND.name,
  url: siteUrl(),
  slogan: BRAND.tagline,
  email: BRAND.supportEmail,
};

const website: WithContext<WebSite> = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: BRAND.name,
  url: siteUrl(),
  inLanguage: "en-IN",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased" suppressHydrationWarning>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(organization) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(website) }} />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
