import { describe, it, expect } from "vitest";
import { SseParser } from "./sse";
describe("SSE framing", () => {
  it("buffers partial events", () => {
    const p = new SseParser();
    expect(p.push('data: {"type":"delta",')).toEqual([]);
    expect(p.push('"text":"政策"}\n\n')).toEqual([
      { type: "delta", text: "政策" },
    ]);
  });
  it("supports CRLF and malformed events followed by valid events", () => {
    const p = new SseParser();
    expect(
      p.push(
        'data: invalid\r\n\r\ndata: {"type":"done","citations":[]}\r\n\r\n',
      ),
    ).toEqual([{ type: "done", citations: [] }]);
  });
  it("supports multiline JSON event data and comments", () => {
    const p = new SseParser();
    expect(
      p.push(':heartbeat\n\ndata: {"type":"delta",\ndata: "text":"好"}\n\n'),
    ).toEqual([{ type: "delta", text: "好" }]);
  });
  it("decodes fragmented UTF8 without replacement characters", () => {
    const data = new TextEncoder().encode(
      'data: {"type":"delta","text":"农业"}\n\n',
    );
    const decoder = new TextDecoder(),
      parser = new SseParser();
    const result = [];
    for (const byte of data)
      result.push(
        ...parser.push(
          decoder.decode(new Uint8Array([byte]), { stream: true }),
        ),
      );
    expect(result).toEqual([{ type: "delta", text: "农业" }]);
  });
});
