"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/features/auth";
import { CartProvider } from "@/features/cart";
import { PrefsProvider } from "@/features/catalog";
import { FlagsProvider } from "@/features/flags";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <PrefsProvider>
      <AuthProvider>
        <FlagsProvider>
          <CartProvider>{children}</CartProvider>
        </FlagsProvider>
      </AuthProvider>
    </PrefsProvider>
  );
}
