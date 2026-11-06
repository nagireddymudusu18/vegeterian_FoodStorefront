import type { ReactNode } from "react";
import { Header } from "@/shell/Header";
import { Footer } from "@/shell/Footer";

/** Customer area: browsing, cart, checkout, orders, tracking, sign-in and profile. */
export default function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {children}
      </main>
      <Footer />
    </div>
  );
}
