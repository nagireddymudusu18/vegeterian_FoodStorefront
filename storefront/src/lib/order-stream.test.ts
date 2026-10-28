import { describe, expect, it } from "vitest";
import { SseParser, parseStatus } from "./order-stream";

describe("SseParser", () => {
  it("parses a status frame", () => {
    const p = new SseParser();
    const msgs = p.push('event:status\ndata:{"status":"PAID"}\n\n');
    expect(msgs).toEqual([{ event: "status", data: '{"status":"PAID"}' }]);
    expect(parseStatus(msgs[0])).toBe("PAID");
  });

  it("handles frames split across chunks and CRLF", () => {
    const p = new SseParser();
    expect(p.push('event: status\r\ndata: {"stat')).toEqual([]);
    const msgs = p.push('us":"PREPARING"}\r\n\r\n');
    expect(parseStatus(msgs[0])).toBe("PREPARING");
  });

  it("ignores comment heartbeats and returns several frames at once", () => {
    const p = new SseParser();
    const msgs = p.push(': ping\n\nevent:status\ndata:{"status":"A"}\n\nevent:status\ndata:{"status":"B"}\n\n');
    expect(msgs.map(parseStatus)).toEqual(["A", "B"]);
  });

  it("ignores unknown events and malformed data", () => {
    expect(parseStatus({ event: "other", data: "{}" })).toBeNull();
    expect(parseStatus({ event: "status", data: "not json" })).toBeNull();
    expect(parseStatus({ event: "status", data: '{"status":5}' })).toBeNull();
  });
});
