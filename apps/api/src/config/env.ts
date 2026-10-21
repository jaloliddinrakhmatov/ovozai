import { z } from "zod";

/**
 * Environment schema for the API. Validated at bootstrap by @nestjs/config.
 *
 * DATABASE_URL and the JWT secret are optional in dev so the process can boot
 * (and serve liveness) without them — readiness reports the DB as down. In
 * production the secret is required and must be strong (see the refinement).
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().positive().default(3001),
    API_HOST: z.string().default("0.0.0.0"),
    CORS_ORIGINS: z.string().default("http://localhost:3000"),
    /** Public base URL of the web app, used to build invitation accept links. */
    APP_WEB_URL: z.string().default("http://localhost:3000"),
    DATABASE_URL: z.string().optional(),
    REDIS_URL: z.string().default("redis://localhost:6379"),

    // --- Auth / tokens ---
    /** HMAC secret for signing short-lived access JWTs. */
    JWT_ACCESS_SECRET: z.string().default("dev-insecure-access-secret-change-me"),
    /** Access-token lifetime (seconds). Default 15 minutes. */
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    /** Refresh-token / session lifetime (seconds). Default 30 days. */
    REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
    /** Invitation validity (seconds). Default 7 days. */
    INVITATION_TTL_SECONDS: z.coerce.number().int().positive().default(604_800),

    // --- Brute-force protection (Redis-backed, best-effort) ---
    /** Max failed-sensitive requests per window, per key. */
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    /** Rate-limit window (seconds). */
    AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production") {
      if (
        !env.JWT_ACCESS_SECRET ||
        env.JWT_ACCESS_SECRET.length < 32 ||
        env.JWT_ACCESS_SECRET.startsWith("dev-insecure")
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["JWT_ACCESS_SECRET"],
          message: "JWT_ACCESS_SECRET must be set to a strong (>=32 char) value in production",
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  return envSchema.parse(config);
}
