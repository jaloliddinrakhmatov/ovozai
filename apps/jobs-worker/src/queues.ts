/**
 * Queue definitions and the job processor (Phase 1 scaffold).
 *
 * Pure and side-effect-free: importing this module opens no connection and
 * starts no worker. The BullMQ `Worker` is created in `src/main.ts`; the actual
 * per-job logic lives here as `processJob` so it stays unit-testable in
 * isolation.
 *
 * Phase 1 has no real job business logic yet. Later phases add real handlers —
 * transcription post-processing, embedding generation, notifications, and usage
 * rollups — dispatched by `job.name`. See ../../docs/ARCHITECTURE.md for the
 * background-jobs design.
 */

/** Canonical BullMQ queue names used across the platform. */
export const QUEUE_NAMES = {
  default: "ovozai:default",
} as const;

/** Result returned by the placeholder processor. */
export interface ProcessJobResult {
  handled: true;
  name: string;
}

/**
 * Placeholder job processor (Phase 1). Logs the job and acknowledges it.
 *
 * This is intentionally a no-op beyond logging: it exists so the worker in
 * `main.ts` has a real, testable handler to call. Real routing by `job.name`
 * arrives in later phases (see module docblock and ../../docs/ARCHITECTURE.md).
 */
export async function processJob(job: {
  name: string;
  data: unknown;
}): Promise<ProcessJobResult> {
  console.info("[jobs-worker] processing job %s (Phase 1 placeholder)", job.name);
  return { handled: true, name: job.name };
}
