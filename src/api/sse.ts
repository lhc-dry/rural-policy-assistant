import type { ChatRequest, SseEvent } from "../types";
export class SseParser {
  private buffer = "";
  push(text: string): SseEvent[] {
    this.buffer += text;
    const result: SseEvent[] = [];
    let match: RegExpExecArray | null;
    while ((match = /\r?\n\r?\n/.exec(this.buffer))) {
      const block = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      const data = block
        .split(/\r?\n/)
        .filter((x) => x.startsWith("data:"))
        .map((x) => x.slice(5).trimStart())
        .join("\n");
      if (!data) continue;
      try {
        const value: unknown = JSON.parse(data);
        if (value && typeof value === "object" && "type" in value) {
          const e = value as SseEvent;
          if (
            (e.type === "delta" && typeof e.text === "string") ||
            (e.type === "done" && Array.isArray(e.citations)) ||
            (e.type === "error" && typeof e.message === "string")
          )
            result.push(e);
        }
      } catch {
        /* Skip malformed events without dropping the next valid frame. */
      }
    }
    return result;
  }
}
export async function streamChat(
  body: ChatRequest,
  signal: AbortSignal,
  onEvent: (e: SseEvent) => void,
) {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout>;
  const reset = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 30000);
  };
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) controller.abort();
  reset();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(
      `${import.meta.env.VITE_API_BASE_URL || "/api"}/visitor/chat/stream`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );
    if (!response.ok || !response.body) throw new Error("网络异常，请检查连接");
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseParser();
    let done = false;
    while (!done) {
      const frame = await reader.read();
      if (frame.done) break;
      reset();
      for (const event of parser.push(
        decoder.decode(frame.value, { stream: true }),
      )) {
        if (event.type === "error") throw new Error(event.message);
        onEvent(event);
        if (event.type === "done") {
          done = true;
          break;
        }
      }
    }
    if (!done) throw new Error("连接中断，请重试");
  } catch (e) {
    if (timedOut) throw new Error("请求超时，请重试");
    throw e;
  } finally {
    clearTimeout(timer!);
    signal.removeEventListener("abort", abort);
    await reader?.cancel().catch(() => undefined);
  }
}
