/**
 * OvozAI jobs-worker — process bootstrap.
 *
 * The only module with side effects: loads env, constructs the Prisma client +
 * embedding provider and the BullMQ `Worker` for the embedding/ingestion queue,
 * routes jobs to the (pure, tested) processor in `./embedding-processor`, and
 * installs graceful-shutdown handlers. If Redis is unreachable the worker logs
 * via its "error" handler and keeps retrying — the process must not crash.
 */

import { Worker, type Job } from "bullmq";
import {
  JOB_QUEUES,
  embeddingJobSchema,
  retentionSweepJobSchema,
  usageRollupJobSchema,
  webhookJobSchema,
} from "@ovozai/contracts";
import { createStorageProvider } from "@ovozai/integrations";
import { getRedisConnectionOptions } from "./redis-connection";
import { createPrismaClient, loadWorkerEnv } from "./db";
import { createEmbedderFromEnv } from "./embedder";
import { processEmbeddingJob } from "./embedding-processor";
import { processWebhookJob } from "./webhook-processor";
import { processUsageRollupJob } from "./usage-rollup-processor";
import { processRetentionSweepJob } from "./retention-sweep-processor";

loadWorkerEnv();

const concurrency = Number(process.env.JOBS_WORKER_CONCURRENCY ?? 5);
const prisma = createPrismaClient();
const embedder = createEmbedderFromEnv();
// Storage for retention sweeps; must match the api/voice-worker config (Phase 7).
const storage = createStorageProvider({
  provider: (process.env.STORAGE_PROVIDER as "local" | "s3") ?? "local",
  baseDir: process.env.STORAGE_LOCAL_DIR,
  bucket: process.env.STORAGE_S3_BUCKET,
  region: process.env.STORAGE_S3_REGION,
  endpoint: process.env.STORAGE_S3_ENDPOINT,
});

console.info("────────────────────────────────────────────────────────");
console.info(" OvozAI jobs-worker started");
console.info(" Queue: %s | concurrency: %d | embedder: %s", JOB_QUEUES.embedding, concurrency, embedder.model);
console.info(" Redis connection errors below (if any) are expected without Redis.");
console.info("────────────────────────────────────────────────────────");

const worker = new Worker(
  JOB_QUEUES.embedding,
  async (job: Job) => {
    const data = embeddingJobSchema.parse(job.data);
    try {
      return await processEmbeddingJob({ prisma, embedder }, data);
    } catch (error) {
      const maxAttempts = job.opts.attempts ?? 1;
      const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts;
      if (isFinalAttempt) {
        await prisma.knowledgeDocument
          .updateMany({
            where: { id: data.documentId, organizationId: data.organizationId },
            data: { status: "FAILED", error: error instanceof Error ? error.message : String(error) },
          })
          .catch((markError) =>
            console.error("[jobs-worker] could not mark document FAILED:", markError),
          );
      }
      throw error;
    }
  },
  { connection: getRedisConnectionOptions(), concurrency },
);

worker.on("error", (error) => console.error("[jobs-worker] embedding worker error:", error.message));
worker.on("ready", () => console.info("[jobs-worker] connected to Redis and ready for jobs"));
worker.on("completed", (job) => console.info("[jobs-worker] embedding job %s completed", job.id ?? "<?>"));
worker.on("failed", (job, error) =>
  console.error("[jobs-worker] embedding job %s failed:", job?.id ?? "<unknown>", error.message),
);

const webhookWorker = new Worker(
  JOB_QUEUES.webhook,
  async (job: Job) => {
    const data = webhookJobSchema.parse(job.data);
    return processWebhookJob({ prisma }, data);
  },
  { connection: getRedisConnectionOptions(), concurrency },
);
webhookWorker.on("error", (error) => console.error("[jobs-worker] webhook worker error:", error.message));
webhookWorker.on("failed", (job, error) =>
  console.error("[jobs-worker] webhook job %s failed:", job?.id ?? "<unknown>", error.message),
);

const usageWorker = new Worker(
  JOB_QUEUES.usageRollup,
  async (job: Job) => {
    const data = usageRollupJobSchema.parse(job.data);
    return processUsageRollupJob({ prisma }, data);
  },
  { connection: getRedisConnectionOptions(), concurrency },
);
usageWorker.on("error", (error) => console.error("[jobs-worker] usage worker error:", error.message));
usageWorker.on("failed", (job, error) =>
  console.error("[jobs-worker] usage job %s failed:", job?.id ?? "<unknown>", error.message),
);

const retentionWorker = new Worker(
  JOB_QUEUES.retention,
  async (job: Job) => {
    const data = retentionSweepJobSchema.parse(job.data);
    return processRetentionSweepJob({ prisma, storage }, data);
  },
  { connection: getRedisConnectionOptions(), concurrency },
);
retentionWorker.on("error", (error) => console.error("[jobs-worker] retention worker error:", error.message));
retentionWorker.on("completed", (job) => console.info("[jobs-worker] retention job %s completed", job.id ?? "<?>"));
retentionWorker.on("failed", (job, error) =>
  console.error("[jobs-worker] retention job %s failed:", job?.id ?? "<unknown>", error.message),
);

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info("[jobs-worker] received %s — shutting down", signal);
  try {
    await worker.close();
    await webhookWorker.close();
    await usageWorker.close();
    await retentionWorker.close();
    await prisma.$disconnect();
  } catch (error) {
    console.error("[jobs-worker] shutdown error:", error instanceof Error ? error.message : error);
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", (signal) => {
  void shutdown(signal);
});
process.on("SIGTERM", (signal) => {
  void shutdown(signal);
});
