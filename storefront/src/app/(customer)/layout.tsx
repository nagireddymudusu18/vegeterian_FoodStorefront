import type { ReactNode } from "react";
import { Header } from "@/shell/Header";

/** Customer area: browsing, cart, checkout, orders, tracking, sign-in and profile. */
export default function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <main id="main" className="mx-auto w-full max-w-5xl px-4 py-6">
        {children}
      </main>
    </>
  );
}
