import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import { Problems } from "../common/problem.exception";
import type { RequestWithContext } from "../common/principal.types";
import { RedisService } from "../redis/redis.service";

/**
 * Brute-force protection for auth endpoints (docs/SECURITY.md §9): a Redis-backed
 * fixed-window limiter keyed by client IP and, when present, the submitted email
 * (per-IP and per-account). Emits `RateLimit-*` / `Retry-After` headers. Fails
 * open if Redis is unavailable (see RedisService).
 */
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithContext & { body?: unknown }>();
    const response = context.switchToHttp().getResponse<Response>();

    const max = Number(this.config.get("AUTH_RATE_LIMIT_MAX") ?? 10);
    const windowSeconds = Number(this.config.get("AUTH_RATE_LIMIT_WINDOW_SECONDS") ?? 60);

    const ip = request.ip ?? "unknown";
    const path = request.path;
    const keys = [`auth:ip:${ip}:${path}`];

    const body = request.body;
    const email =
      typeof body === "object" && body !== null && typeof (body as { email?: unknown }).email === "string"
        ? (body as { email: string }).email.toLowerCase()
        : undefined;
    if (email) {
      keys.push(`auth:email:${email}:${path}`);
    }

    for (const key of keys) {
      const result = await this.redis.hitRateLimit(key, max, windowSeconds);
      response.setHeader("RateLimit-Limit", String(max));
      response.setHeader("RateLimit-Remaining", String(result.remaining));
      response.setHeader("RateLimit-Reset", String(result.resetSeconds));
      if (!result.allowed) {
        response.setHeader("Retry-After", String(result.resetSeconds));
        throw Problems.rateLimited("Too many attempts; please retry later.");
      }
    }
    return true;
  }
}
