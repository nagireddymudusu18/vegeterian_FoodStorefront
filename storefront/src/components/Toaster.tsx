"use client";

import { Toaster as Sonner } from "sonner";

/** App-wide toast host. Toasts are announced to screen readers (aria-live) and dismissible by keyboard. */
export function Toaster() {
  return <Sonner position="bottom-center" closeButton richColors duration={3500} visibleToasts={3} />;
}
