"use client";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import * as m from "motion/react-m";
import type { ReactNode } from "react";

/**
 * Loads only the DOM animation features (small bundle) and honours the visitor's "reduce motion" setting:
 * with it on, transform and layout animations are skipped.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

/** List item that fades up when it first appears; later items start slightly later (capped so long lists stay snappy). */
export function FadeInItem({ index = 0, className, children }: { index?: number; className?: string; children: ReactNode }) {
  return (
    <m.li
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut", delay: Math.min(index, 8) * 0.04 }}
    >
      {children}
    </m.li>
  );
}

export { m };
