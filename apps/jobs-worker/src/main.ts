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
import { JOB_QUEUES, embeddingJobSchema } from "@ovozai/contracts";
import { getRedisConnectionOptions } from "./redis-connection";
import { createPrismaClient, loadWorkerEnv } from "./db";
import { createEmbedderFromEnv } from "./embedder";
import { processEmbeddingJob } from "./embedding-processor";

loadWorkerEnv();

const concurrency = Number(process.env.JOBS_WORKER_CONCURRENCY ?? 5);
const prisma = createPrismaClient();
const embedder = createEmbedderFromEnv();

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

worker.on("error", (error) => console.error("[jobs-worker] worker error:", error.message));
worker.on("ready", () => console.info("[jobs-worker] connected to Redis and ready for jobs"));
worker.on("completed", (job) => console.info("[jobs-worker] job %s completed", job.id ?? "<?>"));
worker.on("failed", (job, error) =>
  console.error("[jobs-worker] job %s failed:", job?.id ?? "<unknown>", error.message),
);

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info("[jobs-worker] received %s — shutting down", signal);
  try {
    await worker.close();
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
