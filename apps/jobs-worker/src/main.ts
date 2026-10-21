/**
 * OvozAI jobs-worker — process bootstrap (Phase 1 scaffold).
 *
 * This is the ONLY module in the package with side effects: it constructs the
 * BullMQ `Worker`, attaches event handlers, and installs signal handlers for a
 * graceful shutdown. All pure/testable logic lives in sibling modules
 * (`./queues`, `./redis-connection`) so tests never import this file and never
 * start a worker or open a connection.
 *
 * Phase 1 wires up the plumbing only: the processor (`processJob`) is a logging
 * placeholder. Real job handlers arrive in later phases (see
 * ../../docs/ARCHITECTURE.md).
 *
 * Note: if Redis is not running, the worker will log connection errors via its
 * "error" handler and keep retrying. That is expected, correct behaviour — the
 * process must NOT crash.
 */

import { Worker } from "bullmq";

import { processJob, QUEUE_NAMES } from "./queues";
import { getRedisConnectionOptions } from "./redis-connection";

const concurrency = Number(process.env.JOBS_WORKER_CONCURRENCY ?? 5);

console.info("────────────────────────────────────────────────────────");
console.info(" OvozAI jobs-worker scaffold started (Phase 1)");
console.info(" Queue: %s | concurrency: %d", QUEUE_NAMES.default, concurrency);
console.info(" Real job handlers arrive later — see docs/ARCHITECTURE.md.");
console.info(" Redis connection errors below (if any) are expected without Redis.");
console.info("────────────────────────────────────────────────────────");

const worker = new Worker(QUEUE_NAMES.default, async (job) => processJob(job), {
  connection: getRedisConnectionOptions(),
  concurrency,
});

// Surfacing "error" is what prevents a missing/unreachable Redis from crashing
// the process with an unhandled error event — it just logs and keeps retrying.
worker.on("error", (error) => {
  console.error("[jobs-worker] worker error:", error.message);
});

worker.on("ready", () => {
  console.info("[jobs-worker] connected to Redis and ready for jobs");
});

worker.on("failed", (job, error) => {
  console.error("[jobs-worker] job %s failed:", job?.name ?? "<unknown>", error.message);
});

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.info("[jobs-worker] received %s — shutting down", signal);
  try {
    await worker.close();
  } catch (error) {
    console.error(
      "[jobs-worker] error while closing worker:",
      error instanceof Error ? error.message : error,
    );
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
