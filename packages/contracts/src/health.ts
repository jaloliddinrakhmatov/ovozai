import { z } from "zod";

/**
 * GET /api/v1/health — liveness probe.
 * Returns 200 whenever the process is running; it does not touch dependencies.
 */
export const livenessResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  version: z.string(),
  uptimeSec: z.number().min(0),
  timestamp: z.string(), // ISO-8601
});
export type LivenessResponse = z.infer<typeof livenessResponseSchema>;

/** Status of a single dependency within the readiness result. */
export const healthIndicatorSchema = z
  .object({
    status: z.enum(["up", "down"]),
  })
  .catchall(z.unknown());
export type HealthIndicator = z.infer<typeof healthIndicatorSchema>;

/**
 * GET /api/v1/health/ready — readiness probe (powered by @nestjs/terminus).
 * 200 when every dependency is `up`; 503 with per-check detail otherwise.
 * Mirrors the Terminus `HealthCheckResult` shape.
 */
export const readinessResponseSchema = z.object({
  status: z.enum(["ok", "error", "shutting_down"]),
  info: z.record(z.string(), healthIndicatorSchema).optional(),
  error: z.record(z.string(), healthIndicatorSchema).optional(),
  details: z.record(z.string(), healthIndicatorSchema),
});
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
