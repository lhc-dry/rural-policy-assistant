import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import crypto from "node:crypto";
import { prisma } from "./db.js";
import { config } from "./config.js";
import { enqueueDocument } from "./queue.js";
import { ensureVisitor, login, requireAdmin, seedAdmin } from "./auth.js";
import { retrieve, type Hit } from "./rag.js";
import { statusMessage, toProcessingStatus } from "./status.js";
import type { Document, Message as PrismaMessage } from "@prisma/client";

const SESSION_COOKIE = "rural_session";
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const categories = [
  { id: "subsidy", name: "惠农补贴政策", description: "补贴申报、资格条件与资金发放", icon: "sprout" },
  { id: "ecommerce", name: "农产品电商", description: "农产品上行、品牌建设与销售", icon: "shopping-bag" },
  { id: "disaster", name: "农业防灾减灾", description: "灾害预警、应急处置与保险", icon: "cloud-rain" },
  { id: "legal", name: "农村法律服务", description: "农村经营、合同与权益保障", icon: "scale" },
  { id: "planting", name: "科学种植技术", description: "作物种植、病虫害与绿色生产", icon: "flower" },
];

type UploadPayload = {
  file?: { buffer: Buffer; filename: string; mimetype: string };
  fields: Record<string, string>;
};

function publicError(error: unknown, fallback = "操作失败") {
  if (error instanceof Error && error.message && !/prisma|sql|redis|embedding|vector|bull/i.test(error.message)) return error.message;
  return fallback;
}

function documentDto(document: Document, admin = false) {
  const status = toProcessingStatus(document.indexStatus);
  return {
    id: document.id,
    categoryId: document.categoryId,
    fileName: document.fileName,
    fileSize: document.fileSize,
    uploadTime: document.createdAt.toISOString(),
    mimeType: "application/pdf" as const,
    ...(admin
      ? {
          processingStatus: status,
          processingMessage: statusMessage(document.indexStatus, document.processingError),
          fileUrl: `/api/admin/documents/${encodeURIComponent(document.id)}/file`,
        }
      : {}),
  };
}

function announcementDto(a: { id: string; title: string; content: string; categoryId: string | null; isPublished: boolean; createdAt: Date; updatedAt: Date }) {
  return {
    id: a.id,
    title: a.title,
    content: a.content,
    categoryId: a.categoryId || undefined,
    isPublished: a.isPublished,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

function safeStoragePath(storageKey: string) {
  const root = path.resolve(config.storageDir);
  const target = path.resolve(root, storageKey);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error("文件路径无效");
  return target;
}

async function readMultipart(request: FastifyRequest): Promise<UploadPayload> {
  const fields: Record<string, string> = {};
  let file: UploadPayload["file"];
  if (!request.isMultipart()) return { fields };
  for await (const part of request.parts()) {
    if (part.type === "file") {
      const chunks: Buffer[] = [];
      for await (const chunk of part.file) chunks.push(Buffer.from(chunk));
      file = { buffer: Buffer.concat(chunks), filename: part.filename, mimetype: part.mimetype };
    } else {
      fields[part.fieldname] = String(part.value);
    }
  }
  return { fields, file };
}

function validPdf(file: NonNullable<UploadPayload["file"]>) {
  return file.mimetype === "application/pdf" && /\.pdf$/i.test(file.filename) && file.buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

async function saveFile(storageKey: string, buffer: Buffer) {
  const target = safeStoragePath(storageKey);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, buffer);
}

async function removeFile(storageKey: string) {
  await fs.rm(safeStoragePath(storageKey), { force: true }).catch(() => undefined);
}

function sendSse(reply: FastifyReply, event: object) {
  if (!reply.raw.destroyed) reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
}

function chunkAnswer(text: string) {
  const result: string[] = [];
  for (let i = 0; i < text.length; i += 24) result.push(text.slice(i, i + 24));
  return result;
}

async function callLlm(question: string, history: Array<{ role: "user" | "assistant"; content: string }>, hits: Hit[]) {
  if (!config.llmBaseUrl || !config.llmModel) throw new Error("回答服务尚未配置，请联系管理员");
  const context = hits.map((hit, i) => `[${i + 1}] ${hit.documentName}（第${hit.pageNumber}页）\n${hit.text}`).join("\n\n");
  const messages = [
    { role: "system", content: "你是乡村助农政策问答助手。只能依据提供的政策原文回答，无法确定时明确说明。不要编造文件、页码或数字。" },
    ...history.slice(-20),
    { role: "user", content: `问题：${question}\n\n政策原文：\n${context}` },
  ];
  const response = await fetch(`${config.llmBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(config.llmApiKey ? { authorization: `Bearer ${config.llmApiKey}` } : {}),
    },
    body: JSON.stringify({ model: config.llmModel, messages, temperature: 0.2 }),
  });
  if (!response.ok) throw new Error("回答服务暂时不可用，请稍后重试");
  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("回答服务未返回内容，请稍后重试");
  return content;
}

async function seedCategories() {
  for (const category of categories) await prisma.category.upsert({ where: { id: category.id }, update: { name: category.name, description: category.description, icon: category.icon }, create: category });
}

async function getConversation(visitorId: string, categoryId: string, requestedId?: string) {
  if (requestedId) {
    const requested = await prisma.conversation.findFirst({ where: { id: requestedId, visitorId, categoryId } });
    if (requested) return requested;
  }
  return prisma.conversation.upsert({ where: { visitorId_categoryId: { visitorId, categoryId } }, update: {}, create: { visitorId, categoryId } });
}

function messageDto(message: PrismaMessage) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    status: message.status,
    citations: Array.isArray(message.citations) ? message.citations : undefined,
    createdAt: message.createdAt.toISOString(),
  };
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await app.register(cookie);
  await app.register(cors, { origin: true, credentials: true });
  await app.register(multipart, { limits: { files: 1, fileSize: MAX_FILE_SIZE, fields: 20 } });

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    const status = (error as { statusCode?: number }).statusCode;
    void reply.code(status && status >= 400 && status < 500 ? status : 500).send({ message: publicError(error) });
  });

  app.get("/api/health", async () => ({ ok: true }));

  app.post<{ Body: { username?: string; password?: string } }>("/api/auth/login", async (request, reply) => {
    const username = String(request.body?.username || "").trim();
    const password = String(request.body?.password || "");
    if (!username || !password) return reply.code(400).send({ message: "请输入账号和密码" });
    const sessionId = await login(username, password);
    if (!sessionId) return reply.code(401).send({ message: "账号或密码错误" });
    reply.setCookie(SESSION_COOKIE, sessionId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 8 * 60 * 60 });
    return { ok: true };
  });

  app.get("/api/auth/me", async (request, reply) => {
    const adminId = await requireAdmin(request, reply);
    if (!adminId) return;
    const admin = await prisma.admin.findUnique({ where: { id: adminId }, select: { id: true, username: true } });
    if (!admin) return reply.code(401).send({ message: "请先登录管理员账号" });
    return admin;
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const id = request.cookies[SESSION_COOKIE];
    if (id) await prisma.session.deleteMany({ where: { id } });
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    reply.clearCookie("rural_visitor", { path: "/" });
    return { ok: true };
  });

  app.get("/api/categories", async () => prisma.category.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, description: true, icon: true } }));

  app.post<{ Body: { id?: string; name?: string; description?: string; icon?: string } }>("/api/admin/categories", async (request, reply) => {
    const adminId = await requireAdmin(request, reply);
    if (!adminId) return;
    const body = request.body || {};
    const name = String(body.name || "").trim();
    if (!name) return reply.code(400).send({ message: "分类名称不能为空" });
    const id = String(body.id || crypto.randomUUID());
    const category = await prisma.category.upsert({ where: { id }, update: { name, description: String(body.description || ""), icon: String(body.icon || "leaf") }, create: { id, name, description: String(body.description || ""), icon: String(body.icon || "leaf") } });
    return category;
  });

  app.delete<{ Params: { id: string } }>("/api/admin/categories/:id", async (request, reply) => {
    const adminId = await requireAdmin(request, reply);
    if (!adminId) return;
    const count = await prisma.document.count({ where: { categoryId: request.params.id, deletedAt: null } });
    if (count) return reply.code(409).send({ message: "请先迁移或删除该分类下的文件" });
    await prisma.category.delete({ where: { id: request.params.id } });
    return { ok: true };
  });

  app.get<{ Querystring: { categoryId?: string } }>("/api/visitor/documents", async (request) => {
    const documents = await prisma.document.findMany({
      where: { deletedAt: null, mimeType: "application/pdf", indexStatus: "ready", ...(request.query.categoryId ? { categoryId: request.query.categoryId } : {}) },
      orderBy: { createdAt: "desc" },
    });
    return documents.map((document) => documentDto(document));
  });

  async function streamDocument(document: Document | null, reply: FastifyReply, requireReady = true) {
    if (!document || document.deletedAt || document.mimeType !== "application/pdf" || (requireReady && document.indexStatus !== "ready")) return reply.code(404).send({ message: "文件暂不可用" });
    try {
      await fs.access(safeStoragePath(document.storageKey));
      reply.type("application/pdf").header("cache-control", "private, max-age=60");
      return reply.send(createReadStream(safeStoragePath(document.storageKey)));
    } catch {
      return reply.code(404).send({ message: "文件不存在" });
    }
  }

  app.get<{ Params: { id: string } }>("/api/visitor/documents/:id/file", async (request, reply) => {
    const document = await prisma.document.findFirst({ where: { id: request.params.id, deletedAt: null, mimeType: "application/pdf", indexStatus: "ready" } });
    return streamDocument(document, reply);
  });

  app.get<{ Params: { id: string } }>("/api/admin/documents/:id/file", async (request, reply) => {
    const adminId = await requireAdmin(request, reply);
    if (!adminId) return;
    const document = await prisma.document.findFirst({ where: { id: request.params.id, deletedAt: null, mimeType: "application/pdf" } });
    return streamDocument(document, reply, false);
  });

  app.get("/api/admin/documents", async (request, reply) => {
    const adminId = await requireAdmin(request, reply);
    if (!adminId) return;
    const query = request.query as { categoryId?: string; fileName?: string; status?: string };
    const status = query.status === "processing" ? { in: ["queued", "extracting", "bm25", "embedding"] } : query.status === "uploaded" ? "ready" : query.status === "failed" ? "failed" : undefined;
    const documents = await prisma.document.findMany({ where: { deletedAt: null, mimeType: "application/pdf", ...(query.categoryId ? { categoryId: query.categoryId } : {}), ...(query.fileName ? { fileName: { contains: query.fileName, mode: "insensitive" } } : {}), ...(status ? { indexStatus: status as never } : {}) }, orderBy: { createdAt: "desc" } });
    return documents.map((document) => documentDto(document, true));
  });

  app.post("/api/admin/documents", async (request, reply) => {
    const adminId = await requireAdmin(request, reply);
    if (!adminId) return;
    const { file, fields } = await readMultipart(request);
    if (!file || !validPdf(file)) return reply.code(400).send({ message: "仅支持有效的 PDF 文件" });
    if (file.buffer.length > MAX_FILE_SIZE) return reply.code(413).send({ message: "文件大小不能超过 50 MB" });
    const categoryId = String(fields.categoryId || "");
    if (!categoryId || !(await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } }))) return reply.code(400).send({ message: "请选择有效板块" });
    const id = crypto.randomUUID();
    const storageKey = `${id}/1.pdf`;
    try {
      await saveFile(storageKey, file.buffer);
      const document = await prisma.document.create({ data: { id, categoryId, fileName: path.basename(file.filename), storageKey, fileSize: file.buffer.length, mimeType: "application/pdf", indexStatus: "queued", versions: { create: { version: 1, storageKey, indexStatus: "queued" } } } });
      await enqueueDocument(id, 1);
      return reply.code(202).send(documentDto(document, true));
    } catch (error) {
      await removeFile(storageKey);
      await prisma.document.delete({ where: { id } }).catch(() => undefined);
      throw error;
    }
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/documents/:id", async (request, reply) => {
    const adminId = await requireAdmin(request, reply);
    if (!adminId) return;
    const existing = await prisma.document.findFirst({ where: { id: request.params.id, deletedAt: null } });
    if (!existing) return reply.code(404).send({ message: "文件不存在" });
    const multipartData = await readMultipart(request);
    const body = request.isMultipart() ? multipartData.fields : (request.body || {});
    const file = multipartData.file;
    if (file && !validPdf(file)) return reply.code(400).send({ message: "仅支持有效的 PDF 文件" });
    const nextCategoryId = String(body.categoryId || existing.categoryId);
    if (!(await prisma.category.findUnique({ where: { id: nextCategoryId }, select: { id: true } }))) return reply.code(400).send({ message: "请选择有效板块" });
    const nextName = String(body.fileName || file?.filename || existing.fileName).trim();
    if (!nextName || !/\.pdf$/i.test(nextName)) return reply.code(400).send({ message: "文件名必须以 .pdf 结尾" });
    const needsProcessing = Boolean(file) || nextCategoryId !== existing.categoryId;
    if (!needsProcessing) return prisma.document.update({ where: { id: existing.id }, data: { fileName: path.basename(nextName) } }).then((document) => documentDto(document, true));
    const nextVersion = existing.version + 1;
    const nextKey = file ? `${existing.id}/${nextVersion}.pdf` : existing.storageKey;
    if (file) await saveFile(nextKey, file.buffer);
    try {
      const document = await prisma.$transaction(async (tx) => {
        await tx.documentChunk.deleteMany({ where: { documentId: existing.id } });
        return tx.document.update({ where: { id: existing.id }, data: { categoryId: nextCategoryId, fileName: path.basename(nextName), storageKey: nextKey, fileSize: file ? file.buffer.length : existing.fileSize, mimeType: "application/pdf", version: nextVersion, indexStatus: "queued", processingError: null, versions: { create: { version: nextVersion, storageKey: nextKey, indexStatus: "queued" } } } });
      });
      await enqueueDocument(existing.id, nextVersion);
      return reply.code(202).send(documentDto(document, true));
    } catch (error) {
      if (file && nextKey !== existing.storageKey) await removeFile(nextKey);
      await prisma.document.update({ where: { id: existing.id }, data: { indexStatus: "failed", processingError: "文件已保存，但后台任务提交失败，请重新处理" } }).catch(() => undefined);
      throw error;
    }
  });

  app.post<{ Params: { id: string } }>("/api/admin/documents/:id/reprocess", async (request, reply) => {
    const adminId = await requireAdmin(request, reply);
    if (!adminId) return;
    const document = await prisma.document.findFirst({ where: { id: request.params.id, deletedAt: null } });
    if (!document) return reply.code(404).send({ message: "文件不存在" });
    if (document.indexStatus !== "failed") return reply.code(409).send({ message: "当前文件无需重新处理" });
    try {
      await fs.access(safeStoragePath(document.storageKey));
    } catch {
      return reply.code(409).send({ message: "原文件不存在，请重新上传 PDF 文件" });
    }
    const updated = await prisma.document.update({ where: { id: document.id }, data: { indexStatus: "queued", processingError: null } });
    await prisma.documentVersion.updateMany({ where: { documentId: document.id, version: document.version }, data: { indexStatus: "queued", processingError: null } });
    try {
      await enqueueDocument(document.id, document.version, true);
    } catch (error) {
      await prisma.$transaction([
        prisma.document.update({ where: { id: document.id }, data: { indexStatus: "failed", processingError: "后台任务提交失败，请稍后重试" } }),
        prisma.documentVersion.updateMany({ where: { documentId: document.id, version: document.version }, data: { indexStatus: "failed", processingError: "后台任务提交失败，请稍后重试" } }),
      ]).catch(() => undefined);
      throw error;
    }
    return reply.code(202).send(documentDto(updated, true));
  });

  app.delete<{ Body: { ids?: string[] } }>("/api/admin/documents", async (request, reply) => {
    const adminId = await requireAdmin(request, reply);
    if (!adminId) return;
    const ids = Array.isArray(request.body?.ids) ? request.body.ids.map(String).filter(Boolean) : [];
    if (!ids.length) return { ok: true };
    const documents = await prisma.document.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true, storageKey: true } });
    await prisma.$transaction(async (tx) => {
      await tx.documentChunk.deleteMany({ where: { documentId: { in: ids } } });
      await tx.document.updateMany({ where: { id: { in: ids } }, data: { deletedAt: new Date(), indexStatus: "failed" } });
    });
    await Promise.all(documents.map((document) => removeFile(document.storageKey)));
    return { ok: true };
  });

  app.get("/api/visitor/announcements", async () => {
    const list = await prisma.announcement.findMany({ where: { isPublished: true }, orderBy: { createdAt: "desc" } });
    return list.map(announcementDto);
  });

  app.get("/api/admin/announcements", async (request, reply) => {
    const adminId = await requireAdmin(request, reply);
    if (!adminId) return;
    const list = await prisma.announcement.findMany({ orderBy: { createdAt: "desc" } });
    return list.map(announcementDto);
  });

  app.post<{ Body: { id?: string; title?: string; content?: string; categoryId?: string; isPublished?: boolean } }>("/api/admin/announcements", async (request, reply) => {
    const adminId = await requireAdmin(request, reply);
    if (!adminId) return;
    const body = request.body || {};
    const title = String(body.title || "").trim();
    const content = String(body.content || "").trim();
    if (!title || !content) return reply.code(400).send({ message: "请填写公告标题和内容" });
    const id = String(body.id || crypto.randomUUID());
    const record = await prisma.announcement.upsert({ where: { id }, update: { title, content, categoryId: body.categoryId ? String(body.categoryId) : null, isPublished: Boolean(body.isPublished) }, create: { id, title, content, categoryId: body.categoryId ? String(body.categoryId) : null, isPublished: Boolean(body.isPublished) } });
    return announcementDto(record);
  });

  app.delete<{ Params: { id: string } }>("/api/admin/announcements/:id", async (request, reply) => {
    const adminId = await requireAdmin(request, reply);
    if (!adminId) return;
    await prisma.announcement.delete({ where: { id: request.params.id } });
    return { ok: true };
  });

  app.get<{ Params: { categoryId: string } }>("/api/visitor/conversations/:categoryId/messages", async (request, reply) => {
    const visitorId = await ensureVisitor(request, reply);
    const conversation = await prisma.conversation.findUnique({ where: { visitorId_categoryId: { visitorId, categoryId: request.params.categoryId } }, include: { messages: { orderBy: { createdAt: "asc" } } } });
    return { conversationId: conversation?.id || null, messages: conversation?.messages.map(messageDto) || [] };
  });

  app.delete<{ Params: { categoryId: string } }>("/api/visitor/conversations/:categoryId", async (request, reply) => {
    const visitorId = await ensureVisitor(request, reply);
    await prisma.conversation.deleteMany({ where: { visitorId, categoryId: request.params.categoryId } });
    return { ok: true };
  });

  app.post<{ Body: { conversationId?: string; categoryId?: string; question?: string; documentIds?: string[]; requestId?: string } }>("/api/visitor/chat/stream", async (request, reply) => {
    const visitorId = await ensureVisitor(request, reply);
    const body = request.body || {};
    const categoryId = String(body.categoryId || "");
    const question = String(body.question || "").trim();
    const requestId = String(body.requestId || "").trim();
    const documentIds = Array.isArray(body.documentIds) ? body.documentIds.map(String).slice(0, 100) : [];
    if (!categoryId || !question || !requestId) return reply.code(400).send({ message: "问题参数不完整" });
    if (!(await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } }))) return reply.code(404).send({ message: "板块不存在" });
    reply.hijack();
    reply.raw.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive" });
    let closed = false;
    request.raw.on("aborted", () => { closed = true; });
    try {
      const existingRequest = await prisma.message.findUnique({ where: { requestId } });
      const conversation = await getConversation(visitorId, categoryId, body.conversationId);
      if (existingRequest && existingRequest.conversationId === conversation.id) {
        const stored = await prisma.message.findFirst({ where: { conversationId: conversation.id, role: "assistant", createdAt: { gt: existingRequest.createdAt } }, orderBy: { createdAt: "asc" } });
        if (stored?.status === "success") {
          for (const part of chunkAnswer(stored.content)) { if (closed) return; sendSse(reply, { type: "delta", text: part }); await new Promise((resolve) => setTimeout(resolve, 8)); }
          sendSse(reply, { type: "done", citations: Array.isArray(stored.citations) ? stored.citations : [], messageId: stored.id, conversationId: conversation.id });
          reply.raw.end();
          return;
        }
      }
      const historyRecords = await prisma.message.findMany({ where: { conversationId: conversation.id, status: "success" }, orderBy: { createdAt: "desc" }, take: 20 });
      const history = historyRecords.reverse().map((message) => ({ role: message.role as "user" | "assistant", content: message.content }));
      let userMessage = existingRequest && existingRequest.conversationId === conversation.id ? existingRequest : null;
      let isNewQuestion = false;
      if (!userMessage) {
        try {
          userMessage = await prisma.message.create({ data: { conversationId: conversation.id, role: "user", content: question, status: "success", requestId } });
          isNewQuestion = true;
        } catch {
          userMessage = await prisma.message.findUnique({ where: { requestId } });
        }
      }
      if (!userMessage) throw new Error("问题未能保存，请重试");
      if (isNewQuestion) {
        const normalizedQuestion = question.toLocaleLowerCase("zh-CN");
        await prisma.questionStat.upsert({ where: { normalizedQuestion_categoryId: { normalizedQuestion, categoryId } }, update: { count: { increment: 1 }, question }, create: { normalizedQuestion, question, categoryId, count: 1 } });
      }
      const contextualQuestion = history.length ? `${history.slice(-6).map((item) => `${item.role === "user" ? "用户" : "助手"}：${item.content}`).join("\n")}\n用户：${question}` : question;
      const hits = await retrieve(categoryId, contextualQuestion, documentIds);
      if (!hits.length) {
        const content = "未找到相关资料，请调整问题或选择其他政策文件。";
        const assistant = await prisma.message.create({ data: { conversationId: conversation.id, role: "assistant", content, status: "success", citations: [] } });
        for (const part of chunkAnswer(content)) { if (closed) return; sendSse(reply, { type: "delta", text: part }); await new Promise((resolve) => setTimeout(resolve, 8)); }
        sendSse(reply, { type: "done", citations: [], messageId: assistant.id, conversationId: conversation.id });
        reply.raw.end();
        return;
      }
      const content = await callLlm(question, history, hits);
      if (closed) return;
      const citations = hits.map((hit) => ({ documentId: hit.documentId, documentName: hit.documentName, pageNumber: hit.pageNumber, textSnippet: hit.text.slice(0, 180), chunkId: hit.id }));
      const assistant = await prisma.message.create({ data: { conversationId: conversation.id, role: "assistant", content, status: "success", citations } });
      for (const part of chunkAnswer(content)) { if (closed) return; sendSse(reply, { type: "delta", text: part }); await new Promise((resolve) => setTimeout(resolve, 8)); }
      sendSse(reply, { type: "done", citations, messageId: assistant.id, conversationId: conversation.id });
    } catch (error) {
      if (!closed) sendSse(reply, { type: "error", message: publicError(error, "回答服务暂时不可用，请稍后重试") });
    } finally {
      if (!reply.raw.destroyed) reply.raw.end();
    }
  });

  app.post<{ Body: { messageId?: string; question?: string; answer?: string; value?: "useful" | "useless" } }>("/api/visitor/feedback", async (request, reply) => {
    const visitorId = await ensureVisitor(request, reply);
    const body = request.body || {};
    if (!body.messageId || !body.value) return reply.code(400).send({ message: "反馈参数不完整" });
    const message = await prisma.message.findFirst({ where: { id: body.messageId, role: "assistant", conversation: { visitorId } }, include: { conversation: true } });
    if (!message) return reply.code(404).send({ message: "回答不存在" });
    const previous = await prisma.feedback.findUnique({ where: { messageId: message.id } });
    await prisma.feedback.upsert({ where: { messageId: message.id }, update: { value: body.value, question: String(body.question || ""), answer: String(body.answer || message.content) }, create: { messageId: message.id, value: body.value, question: String(body.question || ""), answer: String(body.answer || message.content) } });
    const normalizedQuestion = String(body.question || "").trim().toLocaleLowerCase("zh-CN");
    if (normalizedQuestion) {
      const deltaUseless = body.value === "useless" ? (previous?.value === "useless" ? 0 : 1) : previous?.value === "useless" ? -1 : 0;
      const deltaFeedback = previous ? 0 : 1;
      await prisma.questionStat.upsert({ where: { normalizedQuestion_categoryId: { normalizedQuestion, categoryId: message.conversation.categoryId } }, update: { feedbackCount: { increment: deltaFeedback }, uselessCount: { increment: deltaUseless }, question: String(body.question) }, create: { normalizedQuestion, question: String(body.question), categoryId: message.conversation.categoryId, count: 0, feedbackCount: 1, uselessCount: body.value === "useless" ? 1 : 0 } });
    }
    return { ok: true };
  });

  app.get("/api/admin/statistics", async (request, reply) => {
    const adminId = await requireAdmin(request, reply);
    if (!adminId) return;
    const stats = await prisma.questionStat.findMany({ orderBy: [{ count: "desc" }, { updatedAt: "desc" }] });
    return stats.map((stat) => ({ question: stat.question, count: stat.count, feedbackCount: stat.feedbackCount, uselessRate: stat.feedbackCount ? stat.uselessCount / stat.feedbackCount : 0, coverage: stat.count ? stat.feedbackCount / stat.count : 0, hot: stat.count >= 2 && stat.feedbackCount > 0 && (stat.uselessCount / Math.max(1, stat.feedbackCount)) <= 0.2 }));
  });

  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = await buildApp();
  await seedCategories();
  await seedAdmin();
  await fs.mkdir(config.storageDir, { recursive: true });
  await app.listen({ port: config.port, host: "0.0.0.0" });
}
