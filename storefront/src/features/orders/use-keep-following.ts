"use client";

import { useEffect, useState } from "react";
import { REFUND_FOLLOW_MS, awaitsRefund, isTerminal } from "./orders";

/**
 * Whether the page should keep following an order. Unlike `isTerminal`, a cancelled or rejected order is
 * followed for a few minutes so the later move to REFUNDED shows up without a reload.
 */
export function useKeepFollowing(status: string | undefined): boolean {
  const [expired, setExpired] = useState(false);
  const pending = status ? awaitsRefund(status) : false;

  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setExpired(true), REFUND_FOLLOW_MS);
    return () => clearTimeout(t);
  }, [pending]);

  if (!status) return true;
  return !isTerminal(status) || (pending && !expired);
}
