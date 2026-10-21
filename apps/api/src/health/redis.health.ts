import { Injectable } from "@nestjs/common";
import { HealthIndicatorService, type HealthIndicatorResult } from "@nestjs/terminus";
import { RedisService } from "../redis/redis.service";

/** Readiness check for Redis: PINGs the server with a timeout. */
@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly redis: RedisService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    const reachable = await this.redis.ping();
    return reachable ? indicator.up() : indicator.down({ message: "Redis is not reachable" });
  }
}
