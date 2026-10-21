/**
 * Redis connection factory for BullMQ (Phase 1 scaffold).
 *
 * Pure factory: this only builds an options object from `REDIS_URL`. It opens
 * NO connection at import time — the connection is established lazily by BullMQ
 * when the `Worker` is constructed in `src/main.ts`.
 */

import type { ConnectionOptions } from "bullmq";
import type { RedisOptions } from "ioredis";

const DEFAULT_REDIS_URL = "redis://localhost:6379";
const DEFAULT_REDIS_PORT = 6379;

/**
 * Build BullMQ-compatible Redis connection options from `REDIS_URL`.
 *
 * Returns an ioredis `RedisOptions` object (a valid BullMQ `ConnectionOptions`).
 * Resilient worker defaults are applied:
 *  - `maxRetriesPerRequest: null` — REQUIRED by BullMQ for workers, which rely on
 *    blocking commands that must not be aborted after a fixed number of retries.
 *  - a bounded, capped reconnect backoff so a temporarily-unavailable Redis is
 *    retried (errors are surfaced via the connection's "error" event rather than
 *    crashing the process).
 */
export function getRedisConnectionOptions(): ConnectionOptions {
  const url = new URL(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);

  const options: RedisOptions = {
    host: url.hostname,
    port: url.port ? Number(url.port) : DEFAULT_REDIS_PORT,
    // Required by BullMQ for workers (blocking commands must retry indefinitely).
    maxRetriesPerRequest: null,
    // Reconnect with linear backoff capped at 5s so a missing Redis keeps retrying
    // instead of giving up; each failed attempt is reported via the "error" event.
    retryStrategy: (attempts: number) => Math.min(attempts * 200, 5_000),
  };

  if (url.username) {
    options.username = decodeURIComponent(url.username);
  }
  if (url.password) {
    options.password = decodeURIComponent(url.password);
  }

  const db = url.pathname.replace(/^\//, "");
  if (db) {
    options.db = Number(db);
  }

  if (url.protocol === "rediss:") {
    options.tls = {};
  }

  // ioredis `RedisOptions` is accepted by BullMQ as a `ConnectionOptions` member;
  // the cast selects that union member explicitly across package type boundaries.
  return options as ConnectionOptions;
}
