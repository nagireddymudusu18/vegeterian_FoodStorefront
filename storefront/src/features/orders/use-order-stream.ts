"use client";

import { useEffect, useRef, useState } from "react";
import { readOrderStream } from "@/lib/order-stream";

const MAX_BACKOFF_MS = 30_000;

/**
 * Keeps a live status stream open for an order and calls onStatus for every pushed status.
 * Returns true while connected. Reconnects with backoff; callers should keep a slow poll as a fallback.
 */
export function useOrderStream(id: string, enabled: boolean, onStatus: (status: string) => void): boolean {
  const [live, setLive] = useState(false);
  const handler = useRef(onStatus);

  useEffect(() => {
    handler.current = onStatus;
  });

  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const connect = async () => {
      try {
        await readOrderStream(
          id,
          {
            onOpen: () => {
              failures = 0;
              setLive(true);
            },
            onStatus: (s) => handler.current(s),
          },
          ctrl.signal,
        );
      } catch {
        failures += 1;
      }
      setLive(false);
      if (ctrl.signal.aborted) return;
      const delay = Math.min(1000 * 2 ** Math.min(failures, 5), MAX_BACKOFF_MS);
      timer = setTimeout(connect, delay);
    };
    void connect();

    return () => {
      ctrl.abort();
      if (timer) clearTimeout(timer);
      setLive(false);
    };
  }, [id, enabled]);

  return live;
}
