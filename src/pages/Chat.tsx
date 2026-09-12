import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Send,
  Square,
  Trash2,
  FileText,
  Search,
  X,
  Files,
  Check,
} from "lucide-react";
import { api } from "../api/http";
import { streamChat } from "../api/sse";
import { useApp } from "../stores/app";
import { useData } from "../stores/data";
import type { Citation, KnowledgeDocument, Message } from "../types";
import { IconButton } from "../components/IconButton";
import { MessageList } from "../components/MessageList";
import { PdfPreview } from "../components/PdfPreview";
const EMPTY_MESSAGES: Message[] = [];
const EMPTY_IDS: string[] = [];
export function Chat() {
  const { categoryId = "subsidy" } = useParams();
  return <CategoryChat key={categoryId} categoryId={categoryId} />;
}
function CategoryChat({ categoryId }: { categoryId: string }) {
  const data = useData();
  const cat = data.categories.find((c) => c.id === categoryId);
  const docs = data.documents.filter(
    (d) => d.categoryId === categoryId && d.mimeType === "application/pdf",
  );
  const selected = useApp((s) => s.selectedDocs[categoryId] || EMPTY_IDS),
    messages = useApp((s) => s.messages[categoryId] || EMPTY_MESSAGES);
  const [question, setQuestion] = useState(""),
    [filter, setFilter] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [docOpen, setDocOpen] = useState(false),
    [preview, setPreview] = useState<{
      document: KnowledgeDocument;
      citation?: Citation;
    }>(),
    [conversationId, setConversationId] = useState<string>();
  const active = useRef<{ controller: AbortController; messageId: string }>(),
    alive = useRef(true),
    frame = useRef(0),
    buffer = useRef("");
  const selection = selected.filter((id) => docs.some((d) => d.id === id));
  useEffect(() => {
    let active = true;
    void api
      .get<{
        conversationId: string | null;
        messages: Array<{
          id: string;
          role: "user" | "assistant";
          content: string;
          status?: Message["status"];
          citations?: Citation[];
          createdAt: string;
        }>;
      }>(`/visitor/conversations/${categoryId}/messages`)
      .then(({ data }) => {
        if (!active) return;
        setConversationId(data.conversationId || undefined);
        useApp.setState((s) => ({
          messages: {
            ...s.messages,
            [categoryId]: data.messages.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              status: m.status || "success",
              citations: m.citations,
              timestamp: m.createdAt,
            })),
          },
        }));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [categoryId]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cancelAnimationFrame(frame.current);
      if (active.current) {
        active.current.controller.abort();
        useApp
          .getState()
          .update(categoryId, active.current.messageId, { status: "aborted" });
      }
    };
  }, [categoryId]);
  const send = async (text = question, retry?: Message) => {
    if (!text.trim() || busy || active.current) return;
    const input = text.trim();
    const chosen = selected.length ? selection : undefined;
    if (!docs.length) {
      setError("当前暂无可用政策资料");
      return;
    }
    const store = useApp.getState();
    const user: Message = retry || {
      id: crypto.randomUUID(),
      role: "user",
      content: input,
      status: "success",
      timestamp: new Date().toISOString(),
    };
    const reply: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      status: "generating",
      timestamp: new Date().toISOString(),
    };
    const controller = new AbortController();
    active.current = { controller, messageId: reply.id };
    setBusy(true);
    setError("");
    setQuestion("");
    if (!retry) store.add(categoryId, user);
    store.add(categoryId, reply);
    buffer.current = "";
    let content = "";
    let finished = false;
    const flush = () => {
      frame.current = 0;
      if (!buffer.current) return;
      content += buffer.current;
      buffer.current = "";
      if (alive.current && active.current?.messageId === reply.id)
        store.update(categoryId, reply.id, { content });
    };
    try {
      await streamChat(
        {
          question: input,
          requestId: user.id,
          conversationId: conversationId || "",
          categoryId,
          documentIds: chosen,
        },
        controller.signal,
        (event) => {
          if (!alive.current || active.current?.messageId !== reply.id) return;
          if (event.type === "delta") {
            buffer.current += event.text;
            if (!frame.current) frame.current = requestAnimationFrame(flush);
          }
          if (event.type === "done") {
            flush();
            finished = true;
            if (event.conversationId) setConversationId(event.conversationId);
            store.update(categoryId, reply.id, {
              ...(event.messageId ? { id: event.messageId } : {}),
              status: "success",
              citations: event.citations,
              content: content || "暂无回复",
            });
          }
        },
      );
    } catch (e) {
      if (alive.current && active.current?.messageId === reply.id) {
        flush();
        store.update(categoryId, reply.id, {
          status: controller.signal.aborted ? "aborted" : "failed",
        });
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "网络异常，请检查连接");
      }
    } finally {
      cancelAnimationFrame(frame.current);
      if (alive.current && active.current?.messageId === reply.id) {
        flush();
        if (!finished && controller.signal.aborted)
          store.update(categoryId, reply.id, { status: "aborted" });
        active.current = undefined;
        setBusy(false);
      }
    }
  };
  const citation = useCallback((c: Citation) => {
    const document = useData
      .getState()
      .documents.find((d) => d.id === c.documentId);
    if (document) setPreview({ document, citation: c });
    else setError(`原文件已删除。历史引用：${c.textSnippet}`);
  }, []);
  const feedback = async (m: Message, value: "useful" | "useless") => {
    const index = messages.findIndex((x) => x.id === m.id);
    const q = messages
      .slice(0, index)
      .reverse()
      .find((x) => x.role === "user");
    try {
      await api.post("/visitor/feedback", {
        messageId: m.id,
        question: q?.content || "",
        answer: m.content,
        value,
      });
      useApp.getState().update(categoryId, m.id, { feedback: value });
    } catch (e) {
      setError(String(e));
    }
  };
  const retry = (m: Message) => {
    const index = messages.findIndex((x) => x.id === m.id);
    const q = messages
      .slice(0, index)
      .reverse()
      .find((x) => x.role === "user");
    if (q) void send(q.content, q);
  };
  if (!cat)
    return (
      <div className="empty-state">
        {data.categories.length ? "板块不存在" : "正在加载板块…"}
      </div>
    );
  return (
    <div className="chat-layout">
      <aside className={`document-panel ${docOpen ? "mobile-open" : ""}`}>
        <div className="panel-heading">
          <div>
            <h2>
              知识库文档 <span className="count">{docs.length}</span>
            </h2>
            <p className="muted text-xs">
              {selection.length
                ? `已限定 ${selection.length} 个文档`
                : "当前板块全部文档"}
            </p>
          </div>
          <IconButton
            label="关闭文档列表"
            className="mobile-only"
            onClick={() => setDocOpen(false)}
          >
            <X size={18} />
          </IconButton>
        </div>
        <label className="search-field">
          <Search size={16} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="搜索文档"
            aria-label="搜索文档"
          />
        </label>
        <div className="document-items scrollbar">
          {docs
            .filter((d) => d.fileName.includes(filter))
            .map((d) => (
              <div className="document-item" key={d.id}>
                <input
                  type="checkbox"
                  aria-label={`选择 ${d.fileName}`}
                  checked={selection.includes(d.id)}
                  onChange={() => useApp.getState().toggleDoc(categoryId, d.id)}
                />
                <FileText size={20} />
                <div className="min-w-0">
                  <button
                    className="document-name"
                    onClick={() => setPreview({ document: d })}
                  >
                    {d.fileName}
                  </button>
                  <div className="document-meta">
                    {new Date(d.uploadTime).toLocaleDateString("zh-CN")} ·{" "}
                    {Math.max(1, Math.round(d.fileSize / 1024))} KB
                  </div>
                </div>
              </div>
            ))}
          {!docs.length && <div className="empty-state">当前暂无可用政策资料</div>}
        </div>
      </aside>
      <section className="conversation">
        <header className="conversation-heading">
          <div>
            <div className="eyebrow">政策咨询</div>
            <h1>{cat.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <IconButton
              label="知识库文档"
              className="mobile-only"
              onClick={() => setDocOpen(true)}
            >
              <Files size={19} />
            </IconButton>
            <IconButton
              label="清空对话"
              disabled={busy || !messages.length}
              onClick={() => {
                if (window.confirm("清空当前板块的对话记录？")) {
                  void api
                    .delete(`/visitor/conversations/${categoryId}`)
                    .then(() => {
                      useApp.getState().clear(categoryId);
                      setConversationId(undefined);
                    })
                    .catch((e) =>
                      setError(e instanceof Error ? e.message : String(e)),
                    );
                }
              }}
            >
              <Trash2 size={18} />
            </IconButton>
          </div>
        </header>
        <div className="retrieval-scope">
          <Check size={14} />
          {selection.length
            ? `限定 ${selection.length} 份文件`
            : `${docs.length} 份政策文件`}
        </div>
        <MessageList
          messages={messages}
          busy={busy}
          onCitation={citation}
          onFeedback={feedback}
          onRetry={retry}
        />
        {error && (
          <div className="notice danger mx-4" role="alert">
            {error}
            <IconButton label="关闭提示" onClick={() => setError("")}>
              <X size={14} />
            </IconButton>
          </div>
        )}
        <footer className="composer">
          <div className="composer-field">
            <textarea
              aria-label="政策问题"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="输入你想了解的政策问题…"
              rows={2}
              maxLength={3000}
            />
            <IconButton
              label={busy ? "停止生成" : "发送问题"}
              className={busy ? "stop-button" : "send-button"}
              disabled={!busy && !question.trim()}
              onClick={() =>
                busy ? active.current?.controller.abort() : void send()
              }
            >
              {busy ? <Square size={18} /> : <Send size={19} />}
            </IconButton>
          </div>
        </footer>
      </section>
      {preview && (
        <PdfPreview {...preview} onClose={() => setPreview(undefined)} />
      )}
    </div>
  );
}
