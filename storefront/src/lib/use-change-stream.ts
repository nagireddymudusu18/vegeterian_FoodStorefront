"use client";

import { useEffect, useRef, useState } from "react";
import { getTokens } from "./tokens";
import { refreshSession } from "./api";
import { readChangeStream } from "./change-stream";

const POLL_INTERVAL_MS = 15_000;
const MAX_BACKOFF_MS = 30_000;

/**
 * Keeps a live "something changed" stream active and calls onChange for every push. Returns true while connected.
 * Reconnects with backoff and renews an expired token first. Callers keep a slow refresh as a fallback.
 */
export function useChangeStream(path: string, enabled: boolean, onChange: () => void): boolean {
  const [live, setLive] = useState(false);
  const handler = useRef(onChange);

  useEffect(() => {
    handler.current = onChange;
  });

  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const connect = async () => {
      let succeeded = false;
      try {
        const t = getTokens();
        if (t && (t.expiresAt ?? Infinity) - Date.now() < 30_000) await refreshSession();
        await readChangeStream(
          path,
          {
            onOpen: () => {
              failures = 0;
              succeeded = true;
              setLive(true);
            },
            onChange: () => handler.current(),
          },
          ctrl.signal,
        );
      } catch {
        failures += 1;
        setLive(false);
      }
      if (ctrl.signal.aborted) return;
      const delay = succeeded
        ? POLL_INTERVAL_MS
        : Math.min(2000 * 2 ** Math.min(failures, 4), MAX_BACKOFF_MS);
      timer = setTimeout(connect, delay);
    };
    void connect();

    return () => {
      ctrl.abort();
      if (timer) clearTimeout(timer);
      setLive(false);
    };
  }, [path, enabled]);

  return live;
}