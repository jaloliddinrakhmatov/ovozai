import { describe, expect, it, vi } from "vitest";
import type { HealthCheckService } from "@nestjs/terminus";
import { HealthController } from "./health.controller";
import type { PostgresHealthIndicator } from "./postgres.health";
import type { RedisHealthIndicator } from "./redis.health";

describe("HealthController", () => {
  it("liveness() returns status ok with service metadata", () => {
    const controller = new HealthController(
      {} as HealthCheckService,
      {} as PostgresHealthIndicator,
      {} as RedisHealthIndicator,
    );

    const result = controller.liveness();

    expect(result.status).toBe("ok");
    expect(result.service).toBe("api");
    expect(typeof result.uptimeSec).toBe("number");
    expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
  });

  it("readiness() delegates to the Terminus health check service", async () => {
    const check = vi.fn().mockResolvedValue({ status: "ok", info: {}, error: {}, details: {} });
    const controller = new HealthController(
      { check } as unknown as HealthCheckService,
      {} as PostgresHealthIndicator,
      {} as RedisHealthIndicator,
    );

    await controller.readiness();

    expect(check).toHaveBeenCalledTimes(1);
    expect(check.mock.calls[0]?.[0]).toHaveLength(2);
  });
});
