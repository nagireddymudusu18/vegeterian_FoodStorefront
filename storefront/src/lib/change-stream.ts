import { API_BASE } from "./api";
import { SseParser } from "./order-stream";
import { getTokens } from "./tokens";

/**
 * Reads a "changed" server-sent-event stream (e.g. /api/fleet/fleet/stream) with fetch, since EventSource cannot send
 * the Authorization header. Calls onOpen once connected and onChange for each pushed change (the first push arrives
 * straight after connecting). Resolves when the stream ends; throws when it cannot be opened.
 */
export async function readChangeStream(
  path: string,
  h: { onOpen: () => void; onChange: () => void },
  signal: AbortSignal,
): Promise<void> {
  const token = getTokens()?.accessToken;
  if (!token) throw new Error("Not signed in");
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: "text/event-stream", Authorization: `Bearer ${token}` },
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Stream unavailable (${res.status})`);
  h.onOpen();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    for (const msg of parser.push(decoder.decode(value, { stream: true }))) {
      if (msg.event === "changed") h.onChange();
    }
  }
}