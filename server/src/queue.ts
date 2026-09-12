import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config } from "./config.js";
export const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
export const indexQueue = new Queue("document-processing", { connection: redis });
export async function enqueueDocument(documentId: string, version: number, force = false) {
  // BullMQ custom IDs only allow letters, numbers, underscores and hyphens.
  const jobId = force ? `${documentId}-${version}-${Date.now()}` : `${documentId}-${version}`;
  return indexQueue.add("process-document", { documentId, version }, { jobId, removeOnComplete: 100, removeOnFail: 100 });
}
