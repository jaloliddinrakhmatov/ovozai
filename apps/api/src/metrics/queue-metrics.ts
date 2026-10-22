import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { JOB_QUEUES } from "@ovozai/contracts";

/**
 * Best-effort BullMQ queue-depth probe for the /metrics endpoint (Phase 7). Reads
 * job counts per state for every background queue. If Redis is unreachable it
 * returns nothing (the scrape still succeeds) — queue depth is observability, not
 * a liveness dependency.
 */
@Injectable()
export class QueueMetrics implements OnModuleDestroy {
  private readonly logger = new Logger(QueueMetrics.name);
  private readonly connection: IORedis;
  private readonly queues: Record<string, Queue>;

  constructor(config: ConfigService) {
    const url = config.get<string>("REDIS_URL") ?? "redis://localhost:6379";
    this.connection = new IORedis(url, { maxRetriesPerRequest: null, lazyConnect: true });
    this.connection.on("error", (error) => this.logger.debug(`Queue-metrics Redis error: ${error.message}`));
    this.queues = Object.fromEntries(
      Object.values(JOB_QUEUES).map((name) => [name, new Queue(name, { connection: this.connection })]),
    );
  }

  /** Prometheus gauge lines for per-queue job counts, or [] when Redis is down. */
  async collect(): Promise<string[]> {
    try {
      const lines: string[] = [
        "# HELP ovozai_queue_jobs BullMQ job counts by queue and state.",
        "# TYPE ovozai_queue_jobs gauge",
      ];
      const results = await this.withTimeout(
        Promise.all(
          Object.entries(this.queues).map(async ([name, queue]) => {
            const counts = await queue.getJobCounts("waiting", "active", "delayed", "failed", "completed");
            return { name, counts };
          }),
        ),
      );
      for (const { name, counts } of results) {
        for (const [state, value] of Object.entries(counts)) {
          lines.push(`ovozai_queue_jobs{queue="${name}",state="${state}"} ${value}`);
        }
      }
      return lines.length > 2 ? lines : [];
    } catch {
      return [];
    }
  }

  private withTimeout<T>(operation: Promise<T>, timeoutMs = 1500): Promise<T> {
    const timeout = new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("queue-metrics timeout")), timeoutMs),
    );
    return Promise.race([operation, timeout]);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(Object.values(this.queues).map((q) => q.close().catch(() => undefined)));
    this.connection.disconnect();
  }
}
