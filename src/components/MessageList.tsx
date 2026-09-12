import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { VariableSizeList, type ListChildComponentProps } from "react-window";
import {
  ArrowDown,
  BookOpen,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import type { Citation, Message } from "../types";
import { IconButton } from "./IconButton";
interface Props {
  messages: Message[];
  onCitation: (c: Citation) => void;
  onFeedback: (m: Message, f: "useful" | "useless") => void;
  onRetry: (m: Message) => void;
  busy: boolean;
}
interface RowData extends Props {
  measure: (index: number, height: number) => void;
  width: number;
}
const Row = memo(function Row({
  index,
  style,
  data,
}: ListChildComponentProps<RowData>) {
  const ref = useRef<HTMLDivElement>(null);
  const message = data.messages[index];
  useLayoutEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) =>
      data.measure(
        index,
        entry.borderBoxSize?.[0]?.blockSize || entry.contentRect.height + 20,
      ),
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [index, data.measure, data.width]);
  return (
    <div style={style}>
      <div
        ref={ref}
        className={`message-row ${message.role}`}
        data-testid="message"
      >
        <div className="message-bubble">
          <div className="message-label">
            {message.role === "assistant" ? "助农助手" : "我"}
          </div>
          <div className="message-content">
            {(message.content
              ? message.content.split(/(\[\d+\])/g).map((part, i) => {
                  const match = /^\[(\d+)\]$/.exec(part);
                  const cite = match
                    ? message.citations?.[Number(match[1]) - 1]
                    : undefined;
                  return cite ? (
                    <button
                      className="inline-citation"
                      key={i}
                      onClick={() => data.onCitation(cite)}
                      aria-label={`引用 ${match![1]}`}
                    >
                      {part}
                    </button>
                  ) : (
                    part
                  );
                })
              : null) ||
              (message.status === "generating" ? (
                <span className="thinking">
                  正在检索与整理<span>...</span>
                </span>
              ) : (
                "暂无回复"
              ))}
          </div>
          {message.citations?.length ? (
            <div className="citations">
              <div className="citation-label">
                <BookOpen size={13} />
                引用知识库来源
              </div>
              {message.citations.map((c, i) => (
                <button
                  key={c.chunkId}
                  onClick={() => data.onCitation(c)}
                  className="citation-link"
                >
                  [{i + 1}] {c.documentName} · 第 {c.pageNumber} 页
                </button>
              ))}
            </div>
          ) : null}
          {message.role === "assistant" && message.status !== "generating" && (
            <div className="message-actions">
              {message.status === "success" ? (
                <>
                  <IconButton
                    label="有用"
                    aria-pressed={message.feedback === "useful"}
                    onClick={() => data.onFeedback(message, "useful")}
                  >
                    <ThumbsUp size={15} />
                  </IconButton>
                  <IconButton
                    label="无用"
                    aria-pressed={message.feedback === "useless"}
                    onClick={() => data.onFeedback(message, "useless")}
                  >
                    <ThumbsDown size={15} />
                  </IconButton>
                </>
              ) : (
                <>
                  <span
                    className={
                      message.status === "failed" ? "error-text" : "muted"
                    }
                  >
                    {message.status === "aborted" ? "已停止生成" : "回复失败"}
                  </span>
                  <IconButton
                    label="重新生成"
                    disabled={data.busy}
                    onClick={() => data.onRetry(message)}
                  >
                    <RefreshCw size={15} />
                  </IconButton>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
export function MessageList(props: Props) {
  const container = useRef<HTMLDivElement>(null),
    list = useRef<VariableSizeList<RowData>>(null);
  const [size, setSize] = useState({ width: 600, height: 400 }),
    [away, setAway] = useState(false);
  const heights = useRef<Record<string, number>>({});
  const actual = useRef(new Map<string, number>());
  const outer = useRef<HTMLDivElement>(null);
  const offset = useRef(0),
    anchor = useRef(0),
    follow = useRef(true),
    pending = useRef(new Map<number, number>()),
    timer = useRef<ReturnType<typeof setTimeout>>();
  const messages = useRef(props.messages);
  const initialized = useRef(false);
  messages.current = props.messages;
  useEffect(() => {
    try {
      heights.current = JSON.parse(
        localStorage.getItem("rural-heights-v1") || "{}",
      );
    } catch {
      /* Estimates remain valid when the cache is corrupt. */
    }
    const observer = new ResizeObserver(([e]) =>
      setSize({
        width: Math.floor(e.contentRect.width),
        height: Math.floor(e.contentRect.height),
      }),
    );
    if (container.current) observer.observe(container.current);
    return () => {
      observer.disconnect();
      clearTimeout(timer.current);
    };
  }, []);
  const widthRef = useRef(size.width);
  widthRef.current = size.width;
  const key = useCallback(
    (m: Message) =>
      `${m.id}:${widthRef.current}:${m.content.length}:${m.status}:${m.feedback || ""}`,
    [],
  );
  const getSize = useCallback(
    (index: number) => {
      const m = messages.current[index];
      return m
        ? actual.current.get(`${m.id}:${widthRef.current}`) ||
            heights.current[key(m)] ||
            Math.max(
              110,
              Math.min(
                650,
                70 +
                  Math.ceil(
                    m.content.length / Math.max(15, widthRef.current / 16),
                  ) *
                    25,
              ),
            )
        : 110;
    },
    [key],
  );
  const flush = useCallback(() => {
    timer.current = undefined;
    if (!pending.current.size) return;
    let first = Infinity,
      delta = 0;
    pending.current.forEach((height, index) => {
      const m = messages.current[index];
      if (!m) return;
      const old = getSize(index);
      if (index < anchor.current) delta += height - old;
      heights.current[key(m)] = height;
      actual.current.set(`${m.id}:${widthRef.current}`, height);
      first = Math.min(first, index);
    });
    pending.current.clear();
    if (first !== Infinity) list.current?.resetAfterIndex(first, true);
    // Preserve the visible message anchor when measured rows above it change height.
    if (follow.current)
      requestAnimationFrame(() =>
        list.current?.scrollToItem(messages.current.length - 1, "end"),
      );
    else if (delta) list.current?.scrollTo(offset.current + delta);
    try {
      const entries = Object.entries(heights.current).slice(-3000);
      localStorage.setItem(
        "rural-heights-v1",
        JSON.stringify(Object.fromEntries(entries)),
      );
    } catch {
      /* Layout keeps working without persistence. */
    }
  }, [getSize, key]);
  const measure = useCallback(
    (index: number, height: number) => {
      if (height <= 0 || Math.abs(getSize(index) - height) < 1) return;
      pending.current.set(index, Math.ceil(height));
      if (!timer.current)
        timer.current = setTimeout(
          flush,
          messages.current[index]?.status === "generating" ? 100 : 0,
        );
    },
    [flush, getSize],
  );
  useLayoutEffect(() => {
    list.current?.resetAfterIndex(Math.max(0, props.messages.length - 1), true);
    if (follow.current && props.messages.length)
      list.current?.scrollToItem(props.messages.length - 1, "end");
  }, [props.messages.length]);
  useEffect(() => {
    list.current?.resetAfterIndex(0, true);
  }, [size.width]);
  useEffect(() => {
    if (initialized.current || !props.messages.length) return;
    const id = requestAnimationFrame(() => {
      follow.current = true;
      list.current?.scrollToItem(props.messages.length - 1, "end");
      initialized.current = true;
      setAway(false);
    });
    return () => cancelAnimationFrame(id);
  }, [props.messages.length, size.height]);
  const data = useMemo(
    () => ({ ...props, measure, width: size.width }),
    [props, measure, size.width],
  );
  return (
    <div className="messages-host" ref={container}>
      {props.messages.length ? (
        <VariableSizeList
          ref={list}
          outerRef={outer}
          width={size.width}
          height={Math.max(1, size.height)}
          itemCount={props.messages.length}
          itemSize={getSize}
          estimatedItemSize={150}
          itemData={data}
          itemKey={(i, d) => d.messages[i].id}
          overscanCount={4}
          onItemsRendered={({ visibleStartIndex }) =>
            (anchor.current = visibleStartIndex)
          }
          onScroll={({ scrollOffset, scrollUpdateWasRequested }) => {
            offset.current = scrollOffset;
            if (scrollUpdateWasRequested) return;
            const total = outer.current?.scrollHeight || size.height;
            follow.current = scrollOffset + size.height >= total - 20;
            setAway(!follow.current);
          }}
        >
          {Row}
        </VariableSizeList>
      ) : (
        <div className="chat-empty">
          <div className="assistant-mark">
            <BookOpen size={28} />
          </div>
          <h2>今天想了解哪项政策？</h2>
          <p>2025年粮食补贴的申报条件是什么？</p>
        </div>
      )}
      {away && (
        <IconButton
          label="回到底部"
          className="back-bottom"
          onClick={() => {
            follow.current = true;
            setAway(false);
            list.current?.scrollToItem(props.messages.length - 1, "end");
          }}
        >
          <ArrowDown size={18} />
        </IconButton>
      )}
    </div>
  );
}
