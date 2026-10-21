import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { EMBEDDING_JOB_NAME, JOB_QUEUES, type EmbeddingJob } from "@ovozai/contracts";

/**
 * BullMQ producer for knowledge-document ingestion jobs. Uses a lazily-connected
 * Redis so the API still boots without Redis; jobs are retried with exponential
 * backoff by the consumer (apps/jobs-worker).
 */
@Injectable()
export class IngestionQueue implements OnModuleDestroy {
  private readonly logger = new Logger(IngestionQueue.name);
  private readonly connection: IORedis;
  private readonly queue: Queue;

  constructor(config: ConfigService) {
    const url = config.get<string>("REDIS_URL") ?? "redis://localhost:6379";
    this.connection = new IORedis(url, { maxRetriesPerRequest: null, lazyConnect: true });
    this.connection.on("error", (error) => this.logger.debug(`Ingestion Redis error: ${error.message}`));
    this.queue = new Queue(JOB_QUEUES.embedding, { connection: this.connection });
  }

  async enqueueEmbedding(job: EmbeddingJob): Promise<void> {
    await this.queue.add(EMBEDDING_JOB_NAME, job, {
      attempts: 5,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 1000,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close().catch(() => undefined);
    this.connection.disconnect();
  }
}
