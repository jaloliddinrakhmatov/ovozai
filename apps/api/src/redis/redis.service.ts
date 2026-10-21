import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

/** Result of a rate-limit check. `allowed` is fail-open when Redis is down. */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
}

/**
 * Thin ioredis wrapper. Connects lazily so the application boots without Redis;
 * `ping()` never throws, and the rate-limit / session-denylist helpers are
 * best-effort: if Redis is unreachable they fail open (allow) so a Redis outage
 * degrades brute-force protection and instant revocation rather than taking the
 * API down. Access tokens are short-lived, which bounds the exposure.
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

  /**
   * Fixed-window rate limit. Increments `key` and expires it after `windowSeconds`
   * on first hit. Fails open (allowed) if Redis is unavailable.
   */
  async hitRateLimit(key: string, max: number, windowSeconds: number): Promise<RateLimitResult> {
    try {
      const namespaced = `ratelimit:${key}`;
      const count = await this.withTimeout(this.client.incr(namespaced));
      if (count === 1) {
        await this.withTimeout(this.client.expire(namespaced, windowSeconds)).catch(() => undefined);
      }
      const ttl = count === 1 ? windowSeconds : await this.ttl(namespaced, windowSeconds);
      return {
        allowed: count <= max,
        remaining: Math.max(0, max - count),
        resetSeconds: ttl,
      };
    } catch {
      return { allowed: true, remaining: max, resetSeconds: windowSeconds };
    }
  }

  /** Add a session id to the access-token denylist for `ttlSeconds`. Best-effort. */
  async denySession(sessionId: string, ttlSeconds: number): Promise<void> {
    try {
      await this.withTimeout(this.client.set(`denylist:session:${sessionId}`, "1", "EX", ttlSeconds));
    } catch {
      this.logger.debug(`Could not add session ${sessionId} to denylist (Redis unavailable)`);
    }
  }

  /** Whether a session is denylisted. Returns false (fail-open) if Redis is down. */
  async isSessionDenied(sessionId: string): Promise<boolean> {
    try {
      const exists = await this.withTimeout(this.client.exists(`denylist:session:${sessionId}`));
      return exists === 1;
    } catch {
      return false;
    }
  }

  private async ttl(key: string, fallback: number): Promise<number> {
    try {
      const value = await this.withTimeout(this.client.ttl(key));
      return value >= 0 ? value : fallback;
    } catch {
      return fallback;
    }
  }

  private withTimeout<T>(operation: Promise<T>, timeoutMs = 2000): Promise<T> {
    const timeout = new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Redis operation timed out")), timeoutMs),
    );
    return Promise.race([operation, timeout]);
  }

  async onModuleDestroy(): Promise<void> {
    this.client.disconnect();
  }
}
