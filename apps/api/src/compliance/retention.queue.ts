import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { JOB_QUEUES, RETENTION_SWEEP_JOB_NAME, type RetentionSweepJob } from "@ovozai/contracts";

/** BullMQ producer for retention-sweep jobs (consumed by apps/jobs-worker). */
@Injectable()
export class RetentionQueue implements OnModuleDestroy {
  private readonly logger = new Logger(RetentionQueue.name);
  private readonly connection: IORedis;
  private readonly queue: Queue;

  constructor(config: ConfigService) {
    const url = config.get<string>("REDIS_URL") ?? "redis://localhost:6379";
    this.connection = new IORedis(url, { maxRetriesPerRequest: null, lazyConnect: true });
    this.connection.on("error", (error) => this.logger.debug(`Retention Redis error: ${error.message}`));
    this.queue = new Queue(JOB_QUEUES.retention, { connection: this.connection });
  }

  async enqueue(job: RetentionSweepJob): Promise<void> {
    await this.queue.add(RETENTION_SWEEP_JOB_NAME, job, {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close().catch(() => undefined);
    this.connection.disconnect();
  }
}
