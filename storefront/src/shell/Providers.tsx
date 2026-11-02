"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/features/auth";
import { CartProvider } from "@/features/cart";
import { PrefsProvider } from "@/features/catalog";
import { FlagsProvider } from "@/features/flags";
import { Toaster } from "@/components/Toaster";
import { MotionProvider } from "@/components/motion";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionProvider>
      <PrefsProvider>
        <AuthProvider>
          <FlagsProvider>
            <CartProvider>{children}</CartProvider>
          </FlagsProvider>
        </AuthProvider>
        <Toaster />
      </PrefsProvider>
    </MotionProvider>
  );
}
