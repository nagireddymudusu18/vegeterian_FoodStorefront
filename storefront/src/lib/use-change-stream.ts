"use client";

import { useEffect, useRef, useState } from "react";
import { getTokens } from "./tokens";
import { refreshSession } from "./api";
import { readChangeStream } from "./change-stream";

const MAX_BACKOFF_MS = 30_000;

/**
 * Keeps a live "something changed" stream open and calls onChange for every push. Returns true while connected.
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
      try {
        const t = getTokens();
        if (t && (t.expiresAt ?? Infinity) - Date.now() < 30_000) await refreshSession();
        await readChangeStream(
          path,
          {
            onOpen: () => {
              failures = 0;
              setLive(true);
            },
            onChange: () => handler.current(),
          },
          ctrl.signal,
        );
      } catch {
        failures += 1;
      }
      setLive(false);
      if (ctrl.signal.aborted) return;
      timer = setTimeout(connect, Math.min(1000 * 2 ** Math.min(failures, 5), MAX_BACKOFF_MS));
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