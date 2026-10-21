import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { JOB_QUEUES, WEBHOOK_JOB_NAME, type WebhookJob } from "@ovozai/contracts";

/** BullMQ producer for outbound webhook deliveries (consumed by apps/jobs-worker). */
@Injectable()
export class WebhookQueue implements OnModuleDestroy {
  private readonly logger = new Logger(WebhookQueue.name);
  private readonly connection: IORedis;
  private readonly queue: Queue;

  constructor(config: ConfigService) {
    const url = config.get<string>("REDIS_URL") ?? "redis://localhost:6379";
    this.connection = new IORedis(url, { maxRetriesPerRequest: null, lazyConnect: true });
    this.connection.on("error", (error) => this.logger.debug(`Webhook Redis error: ${error.message}`));
    this.queue = new Queue(JOB_QUEUES.webhook, { connection: this.connection });
  }

  async enqueue(job: WebhookJob): Promise<void> {
    await this.queue.add(WEBHOOK_JOB_NAME, job, {
      attempts: 6,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 200,
      removeOnFail: 1000,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close().catch(() => undefined);
    this.connection.disconnect();
  }
}
