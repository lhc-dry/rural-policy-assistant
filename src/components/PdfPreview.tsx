import { useEffect, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  X,
  Download,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { Citation, KnowledgeDocument } from "../types";
import { IconButton } from "./IconButton";
import { normalizeText } from "../utils/text";
GlobalWorkerOptions.workerSrc = pdfWorker;
export function PdfPreview({
  document,
  citation,
  onClose,
}: {
  document: KnowledgeDocument;
  citation?: Citation;
  onClose: () => void;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy>(),
    [page, setPage] = useState(citation?.pageNumber || 1),
    [zoom, setZoom] = useState(1),
    [error, setError] = useState(""),
    [url, setUrl] = useState(""),
    [match, setMatch] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null),
    layer = useRef<HTMLDivElement>(null),
    host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(650);
  useEffect(() => {
    const previous = globalThis.document.activeElement as HTMLElement | null;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = host.current
          ?.closest('[role="dialog"]')
          ?.querySelectorAll<HTMLElement>("button,input,a[href]");
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && globalThis.document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && globalThis.document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    globalThis.document.addEventListener("keydown", handler);
    host.current?.closest('[role="dialog"]')?.querySelector("button")?.focus();
    return () => {
      globalThis.document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [onClose]);
  useEffect(() => {
    let disposed = false;
    let objectUrl = "";
    let task: ReturnType<typeof getDocument> | undefined;
    void (async () => {
      try {
        const apiBase = import.meta.env.VITE_API_BASE_URL || "/api";
        const source =
          document.fileUrl && document.fileUrl !== "#"
            ? document.fileUrl
            : `${apiBase}/visitor/documents/${encodeURIComponent(document.id)}/file`;
        const response = await fetch(source, { credentials: "include" });
        if (!response.ok) throw new Error("原文件已删除或暂不可用");
        objectUrl = URL.createObjectURL(await response.blob());
        if (disposed) return;
        setUrl(objectUrl);
        if (document.mimeType !== "application/pdf") return;
        task = getDocument({ url: objectUrl, useSystemFonts: true });
        const loaded = await task.promise;
        if (!disposed) {
          setPdf(loaded);
          setPage(Math.min(citation?.pageNumber || 1, loaded.numPages));
        }
      } catch (e) {
        if (!disposed)
          setError(e instanceof Error ? e.message : "文件加载失败");
      }
    })();
    return () => {
      disposed = true;
      if (objectUrl.startsWith("blob:")) URL.revokeObjectURL(objectUrl);
      void task?.destroy();
    };
  }, [document.id, document.mimeType, citation]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const observer = new ResizeObserver(([e]) =>
      setWidth(Math.max(240, e.contentRect.width - 32)),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!pdf) return;
    let disposed = false;
    let render:
      | ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
      | undefined;
    let textLayer: TextLayer | undefined;
    void (async () => {
      try {
        const p = await pdf.getPage(page);
        if (disposed || !canvas.current || !layer.current) return;
        const base = p.getViewport({ scale: 1 });
        const viewport = p.getViewport({
          scale: Math.min(width / base.width, 1.5) * zoom,
        });
        const c = canvas.current;
        c.width = viewport.width;
        c.height = viewport.height;
        c.style.width = `${viewport.width}px`;
        c.style.height = `${viewport.height}px`;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        layer.current.replaceChildren();
        layer.current.style.setProperty(
          "--scale-factor",
          String(viewport.scale),
        );
        layer.current.style.width = `${viewport.width}px`;
        layer.current.style.height = `${viewport.height}px`;
        render = p.render({ canvasContext: ctx, viewport });
        await render.promise;
        if (disposed) return;
        const content = await p.getTextContent();
        if (disposed) return;
        textLayer = new TextLayer({
          textContentSource: content,
          container: layer.current,
          viewport,
        });
        await textLayer.render();
        if (disposed) return;
        setMatch("");
        if (citation) {
          const spans = Array.from(layer.current.querySelectorAll("span"));
          let combined = "";
          const positions = spans.map((s) => {
            const start = combined.length;
            combined += normalizeText(s.textContent || "");
            return { s, start, end: combined.length };
          });
          const snippet = normalizeText(citation.textSnippet);
          const found = combined.indexOf(snippet);
          if (found >= 0 && snippet) {
            positions
              .filter((x) => x.end > found && x.start < found + snippet.length)
              .forEach((x) => x.s.classList.add("citation-highlight"));
            setMatch("已定位引用原文");
          } else setMatch("已定位页码，当前页未匹配到完整原文");
        }
        host.current?.scrollTo({ top: 0 });
      } catch (e) {
        if (
          !disposed &&
          !(e instanceof Error && e.name === "RenderingCancelledException")
        )
          setError("PDF 页面渲染失败");
      }
    })();
    return () => {
      disposed = true;
      render?.cancel();
      textLayer?.cancel();
    };
  }, [pdf, page, zoom, width, citation]);
  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        className="pdf-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="文件预览"
      >
        <header className="panel-heading">
          <div className="min-w-0">
            <strong className="block truncate">{document.fileName}</strong>
            <span className="muted text-xs">
              {document.mimeType === "application/pdf"
                ? "PDF 文档"
                : "Word 文档"}
            </span>
          </div>
          <IconButton label="关闭预览" onClick={onClose}>
            <X size={19} />
          </IconButton>
        </header>
        <div className="pdf-toolbar">
          <IconButton
            label="上一页"
            disabled={page <= 1}
            onClick={() => setPage((x) => x - 1)}
          >
            <ChevronLeft size={17} />
          </IconButton>
          <span>
            {page} / {pdf?.numPages || "-"}
          </span>
          <IconButton
            label="下一页"
            disabled={!pdf || page >= pdf.numPages}
            onClick={() => setPage((x) => x + 1)}
          >
            <ChevronRight size={17} />
          </IconButton>
          <IconButton
            label="缩小"
            disabled={zoom <= 0.6}
            onClick={() => setZoom((z) => z - 0.2)}
          >
            <ZoomOut size={17} />
          </IconButton>
          <IconButton
            label="放大"
            disabled={zoom >= 2}
            onClick={() => setZoom((z) => z + 0.2)}
          >
            <ZoomIn size={17} />
          </IconButton>
          {url && (
            <a
              className="icon-button"
              title="下载文件"
              aria-label="下载文件"
              download={document.fileName}
              href={url}
            >
              <Download size={17} />
            </a>
          )}
        </div>
        <div className="pdf-host scrollbar" ref={host}>
          {error ? (
            <div className="notice danger">{error}</div>
          ) : document.mimeType !== "application/pdf" ? (
            <div className="empty-state">此文件可下载后查看</div>
          ) : !pdf ? (
            <div className="empty-state">正在加载文件…</div>
          ) : (
            <div className="pdf-page">
              <canvas ref={canvas} />
              <div className="textLayer" ref={layer} />
            </div>
          )}
        </div>
        {citation && (
          <footer className="citation-summary">
            <span className="status-dot" />
            {match || "引用摘要"}
            <p>{citation.textSnippet}</p>
          </footer>
        )}
      </section>
    </div>
  );
}
