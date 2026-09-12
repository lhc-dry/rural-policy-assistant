import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "./db.js";
import { config } from "./config.js";
const COOKIE = "rural_session";
const VISITOR_COOKIE = "rural_visitor";
export async function ensureVisitor(request: FastifyRequest, reply: FastifyReply) {
  let id = request.cookies[VISITOR_COOKIE];
  if (!id) { id = `v_${crypto.randomUUID()}`; reply.setCookie(VISITOR_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90 }); }
  const existing = await prisma.session.findFirst({ where: { visitorId: id, expiresAt: { gt: new Date() } } });
  if (!existing) await prisma.session.create({ data: { id: crypto.randomUUID(), visitorId: id, expiresAt: new Date(Date.now() + 90 * 86400000) } });
  return id;
}
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const id = request.cookies[COOKIE];
  const session = id ? await prisma.session.findFirst({ where: { id, adminId: { not: null }, expiresAt: { gt: new Date() } } }) : null;
  if (!session) { await reply.code(401).send({ message: "请先登录管理员账号" }); return null; }
  return session.adminId;
}
export async function login(username: string, password: string) {
  const admin = await prisma.admin.findUnique({ where: { username } });
  if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) return null;
  const id = crypto.randomUUID();
  await prisma.session.create({ data: { id, adminId: admin.id, expiresAt: new Date(Date.now() + 8 * 3600000) } });
  return id;
}
export async function seedAdmin() {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "123456";
  const exists = await prisma.admin.findUnique({ where: { username } });
  if (!exists) await prisma.admin.create({ data: { username, passwordHash: await bcrypt.hash(password, 12) } });
}
