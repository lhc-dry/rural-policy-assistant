import path from "node:path";
export const config = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL || "postgresql://rural:rural@localhost:5432/rural_policy",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  storageDir: process.env.FILE_STORAGE_DIR || path.resolve("server/data/uploads"),
  sessionSecret: process.env.SESSION_SECRET || "local-development-secret",
  embeddingsBaseUrl: process.env.EMBEDDINGS_BASE_URL || "",
  embeddingsApiKey: process.env.EMBEDDINGS_API_KEY || "",
  embeddingsModel: process.env.EMBEDDINGS_MODEL || "",
  embeddingsTimeoutMs: Math.max(5_000, Number(process.env.EMBEDDINGS_TIMEOUT_MS || 45_000)),
  embeddingsBatchSize: Math.max(1, Math.min(32, Number(process.env.EMBEDDINGS_BATCH_SIZE || 8))),
  llmBaseUrl: process.env.LLM_BASE_URL || "",
  llmApiKey: process.env.LLM_API_KEY || "",
  llmModel: process.env.LLM_MODEL || "",
};
