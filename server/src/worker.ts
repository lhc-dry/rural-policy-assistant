import { Worker } from "bullmq";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pdfParse from "pdf-parse";
import { prisma } from "./db.js";
import { config } from "./config.js";
import { enqueueDocument, redis } from "./queue.js";

type PageData = { getTextContent: () => Promise<{ items: Array<{ str?: string }> }> };
type ChunkInput = { id: string; documentId: string; documentVersionId: string; categoryId: string; text: string; pageNumber: number; chunkIndex: number };

function splitPage(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const chunks: string[] = [];
  for (let start = 0; start < normalized.length; start += 420) {
    const chunk = normalized.slice(start, start + 500).trim();
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}

async function extractPages(bytes: Buffer) {
  const pages: Array<{ pageNumber: number; text: string }> = [];
  await pdfParse(bytes, { pagerender: async (pageData: unknown) => {
    const page = pageData as PageData;
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str || "").join(" ").replace(/\s+/g, " ").trim();
    pages.push({ pageNumber: pages.length + 1, text });
    return text;
  } });
  return pages.filter((page) => page.text.length > 0);
}

async function createEmbeddings(texts: string[]) {
  if (!config.embeddingsBaseUrl || !config.embeddingsModel) throw new Error("未配置 Embeddings 服务");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.embeddingsTimeoutMs);
  try {
    const response = await fetch(config.embeddingsBaseUrl.replace(/\/$/, "") + "/embeddings", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", ...(config.embeddingsApiKey ? { authorization: "Bearer " + config.embeddingsApiKey } : {}) },
      body: JSON.stringify({ model: config.embeddingsModel, input: texts.length === 1 ? texts[0] : texts }),
    });
    if (!response.ok) throw new Error("Embeddings 服务返回 " + response.status);
    const body = (await response.json()) as { data?: Array<{ index?: number; embedding?: number[] }> };
    const data = [...(body.data || [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const vectors = data.map((item) => item.embedding);
    if (vectors.length !== texts.length || vectors.some((vector) => !vector?.length || vector.some((value) => !Number.isFinite(value)))) {
      throw new Error("Embeddings 服务未返回完整向量");
    }
    return vectors as number[][];
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error(`Embeddings 服务请求超时（${Math.round(config.embeddingsTimeoutMs / 1000)} 秒）`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function isCurrent(documentId: string, version: number) {
  const document = await prisma.document.findUnique({ where: { id: documentId }, select: { version: true, deletedAt: true } });
  return Boolean(document && !document.deletedAt && document.version === version);
}

async function discardVersion(documentVersionId: string) {
  await prisma.documentChunk.deleteMany({ where: { documentVersionId } });
}

export const processor = new Worker("document-processing", async (job) => {
  const { documentId, version } = job.data as { documentId: string; version: number };
  const document = await prisma.document.findUnique({ where: { id: documentId }, include: { versions: true } });
  const documentVersion = document?.versions.find((item) => item.version === version);
  if (!document || !documentVersion || document.deletedAt || document.version !== version) return;
  await prisma.$transaction([
    prisma.document.update({ where: { id: documentId }, data: { indexStatus: "extracting", processingError: null } }),
    prisma.documentVersion.update({ where: { id: documentVersion.id }, data: { indexStatus: "extracting", processingError: null } }),
  ]);
  try {
    const bytes = await fs.readFile(path.resolve(config.storageDir, documentVersion.storageKey));
    const pages = await extractPages(bytes);
    if (!pages.length) throw new Error("PDF 未检测到可提取文本");
    if (!(await isCurrent(documentId, version))) return;
    let chunkIndex = 0;
    const chunks: ChunkInput[] = pages.flatMap((page) => splitPage(page.text).map((text) => {
      const index = chunkIndex++;
      return { id: documentId + ":" + version + ":" + page.pageNumber + ":" + index, documentId, documentVersionId: documentVersion.id, categoryId: document.categoryId, text, pageNumber: page.pageNumber, chunkIndex: index };
    }));
    if (!chunks.length) throw new Error("PDF 未检测到可提取文本");
    await prisma.$transaction([
      prisma.document.update({ where: { id: documentId }, data: { indexStatus: "bm25" } }),
      prisma.documentVersion.update({ where: { id: documentVersion.id }, data: { indexStatus: "bm25" } }),
      prisma.documentChunk.deleteMany({ where: { documentVersionId: documentVersion.id } }),
      prisma.documentChunk.createMany({ data: chunks }),
    ]);
    if (!(await isCurrent(documentId, version))) { await discardVersion(documentVersion.id); return; }
    await prisma.$transaction([
      prisma.document.update({ where: { id: documentId }, data: { indexStatus: "embedding" } }),
      prisma.documentVersion.update({ where: { id: documentVersion.id }, data: { indexStatus: "embedding" } }),
    ]);
    try {
      for (let start = 0; start < chunks.length; start += config.embeddingsBatchSize) {
        if (!(await isCurrent(documentId, version))) { await discardVersion(documentVersion.id); return; }
        const batch = chunks.slice(start, start + config.embeddingsBatchSize);
        const vectors = await createEmbeddings(batch.map((chunk) => chunk.text));
        for (let index = 0; index < batch.length; index += 1) {
          await prisma.$executeRawUnsafe('UPDATE "DocumentChunk" SET embedding = $1::vector WHERE id = $2', "[" + vectors[index].join(",") + "]", batch[index].id);
        }
      }
    } catch (error) {
      console.warn("embedding unavailable; publishing BM25-only document", error);
    }
    if (!(await isCurrent(documentId, version))) { await discardVersion(documentVersion.id); return; }
    await prisma.$transaction([
      prisma.documentVersion.update({ where: { id: documentVersion.id }, data: { indexStatus: "ready", processingError: null } }),
      prisma.document.update({ where: { id: documentId }, data: { indexStatus: "ready", processingError: null } }),
    ]);
  } catch (error) {
    if (await isCurrent(documentId, version)) {
      const reason = error instanceof Error ? error.message : "文件处理失败";
      await prisma.$transaction([
        prisma.documentChunk.deleteMany({ where: { documentVersionId: documentVersion.id } }),
        prisma.documentVersion.update({ where: { id: documentVersion.id }, data: { indexStatus: "failed", processingError: reason } }),
        prisma.document.update({ where: { id: documentId }, data: { indexStatus: "failed", processingError: reason } }),
      ]);
    }
    throw error;
  }
}, { connection: redis, concurrency: 1 });

async function resumePendingDocuments() {
  const pending = await prisma.document.findMany({ where: { deletedAt: null, indexStatus: { in: ["queued", "extracting", "bm25", "embedding"] } }, select: { id: true, version: true } });
  for (const document of pending) await enqueueDocument(document.id, document.version, true);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  processor.on("completed", (job) => console.log("document processed " + job.id));
  processor.on("failed", (job, error) => console.error("document processing failed " + job?.id, error));
  void resumePendingDocuments();
}
