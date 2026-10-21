import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

/**
 * Thin ioredis wrapper. Connects lazily so the application boots without Redis;
 * `ping()` never throws (it resolves to `false` on failure or timeout) so the
 * readiness probe can report status cleanly.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(config: ConfigService) {
    const url = config.get<string>("REDIS_URL") ?? "redis://localhost:6379";
    this.client = new Redis(url, {
      lazyConnect: true,
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => (times > 5 ? 2000 : Math.min(times * 200, 2000)),
    });
    // Swallow error events so a down Redis does not crash the process; the
    // readiness probe surfaces the real status.
    this.client.on("error", (error) => this.logger.debug(`Redis error: ${error.message}`));
  }

  async ping(timeoutMs = 2000): Promise<boolean> {
    const ping = this.client
      .ping()
      .then((reply) => reply === "PONG")
      .catch(() => false);
    const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs));
    return Promise.race([ping, timeout]);
  }

  async onModuleDestroy(): Promise<void> {
    this.client.disconnect();
  }
}
