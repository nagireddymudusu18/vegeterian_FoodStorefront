import { API_BASE } from "./api";
import { getTokens } from "./tokens";

export interface SseMessage {
  event: string;
  data: string;
}

/** Incremental parser for text/event-stream. Feed it decoded text chunks; it returns completed messages. */
export class SseParser {
  private buffer = "";
  private event = "message";
  private data: string[] = [];

  push(chunk: string): SseMessage[] {
    this.buffer += chunk;
    const out: SseMessage[] = [];
    let nl: number;
    while ((nl = this.buffer.search(/\r\n|\n|\r/)) !== -1) {
      const line = this.buffer.slice(0, nl);
      const sepLen = this.buffer.startsWith("\r\n", nl) ? 2 : 1;
      // a lone trailing \r may be the first half of \r\n; wait for more input
      if (this.buffer[nl] === "\r" && nl + 1 === this.buffer.length) break;
      this.buffer = this.buffer.slice(nl + sepLen);
      if (line === "") {
        if (this.data.length > 0) out.push({ event: this.event, data: this.data.join("\n") });
        this.event = "message";
        this.data = [];
      } else if (!line.startsWith(":")) {
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        let value = colon === -1 ? "" : line.slice(colon + 1);
        if (value.startsWith(" ")) value = value.slice(1);
        if (field === "event") this.event = value;
        else if (field === "data") this.data.push(value);
      }
    }
    return out;
  }
}

export function parseStatus(msg: SseMessage): string | null {
  if (msg.event !== "status") return null;
  try {
    const v = JSON.parse(msg.data) as { status?: unknown };
    return typeof v.status === "string" ? v.status : null;
  } catch {
    return null;
  }
}

export interface OrderStreamHandlers {
  onOpen: () => void;
  onStatus: (status: string) => void;
}

/**
 * Reads GET /orders/{id}/stream with fetch (EventSource cannot send the Authorization header).
 * Resolves when the stream ends; throws when it cannot be opened. Abort through the signal.
 */
export async function readOrderStream(id: string, h: OrderStreamHandlers, signal: AbortSignal): Promise<void> {
  const token = getTokens()?.accessToken;
  if (!token) throw new Error("Not signed in");
  const res = await fetch(`${API_BASE}/api/orders/orders/${encodeURIComponent(id)}/stream`, {
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
      const status = parseStatus(msg);
      if (status) h.onStatus(status);
    }
  }
}
