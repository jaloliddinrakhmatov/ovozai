import { Controller, Get } from "@nestjs/common";
import { HealthCheck, HealthCheckService, type HealthCheckResult } from "@nestjs/terminus";
import type { LivenessResponse } from "@ovozai/contracts";
import { Public } from "../common/public.decorator";
import { PostgresHealthIndicator } from "./postgres.health";
import { RedisHealthIndicator } from "./redis.health";

// Routes are mounted under the global prefix `api/v1`, yielding
// GET /api/v1/health and GET /api/v1/health/ready.
// Health endpoints are unauthenticated (see docs/API.md §10).
@Public()
@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly postgres: PostgresHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  /** Liveness: the process is up. Never touches dependencies. */
  @Get("health")
  liveness(): LivenessResponse {
    return {
      status: "ok",
      service: "api",
      version: process.env.npm_package_version ?? "0.1.0",
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /** Readiness: PostgreSQL + Redis reachable. 200 when healthy, 503 otherwise. */
  @Get("health/ready")
  @HealthCheck()
  readiness(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.postgres.isHealthy("postgres"),
      () => this.redis.isHealthy("redis"),
    ]);
  }
}
