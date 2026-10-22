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

    // --- Embeddings (knowledge base). Must match the jobs-worker config so
    //     query vectors and chunk vectors are comparable. ---
    EMBEDDING_PROVIDER: z.enum(["local", "openai"]).default("local"),
    EMBEDDING_MODEL: z.string().optional(),
    EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(256),
    EMBEDDING_API_KEY: z.string().optional(),
    EMBEDDING_BASE_URL: z.string().optional(),

    // --- Internal voice-worker <-> API channel (service token + HMAC) ---
    INTERNAL_SERVICE_TOKEN: z.string().default("dev-insecure-service-token-change-me"),
    INTERNAL_HMAC_SECRET: z.string().default("dev-insecure-hmac-secret-change-me-0123456789"),
    /** Max age (seconds) of a signed internal request before it is rejected. */
    INTERNAL_SIGNATURE_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(300),

    // --- Object storage for recordings (Phase 5). Must match the voice-worker. ---
    STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
    STORAGE_LOCAL_DIR: z.string().optional(),
    STORAGE_S3_BUCKET: z.string().optional(),
    STORAGE_S3_REGION: z.string().optional(),
    STORAGE_S3_ENDPOINT: z.string().optional(),

    // --- Hardening & compliance (Phase 7) ---
    /** RLS-enforced connection string: a non-superuser role (`ovozai_app`) for
     *  which Row-Level Security applies. When set, PrismaService.runWithOrgScope
     *  routes through it as defense-in-depth. Unset → falls back to DATABASE_URL
     *  (dev: the owner role bypasses RLS; the app-layer guard remains primary). */
    DATABASE_APP_URL: z.string().optional(),
    /** Log output format. "json" emits structured, PII-redacted lines for log
     *  aggregation; "pretty" is the human-readable Nest logger. Defaults to json
     *  in production, pretty otherwise. */
    LOG_FORMAT: z.enum(["json", "pretty"]).optional(),
    /** Expose the Prometheus metrics endpoint at GET /metrics. */
    METRICS_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    /** Data-residency region of the PII-bearing stores (Law No. ZRU-547).
     *  Surfaced on readiness/metrics for auditability; "uz" = in-country. */
    DATA_REGION: z.string().default("uz"),

    // --- Browser "Test Agent" voice gateway (real-voice) ---
    /** Public WebSocket URL of the voice-worker gateway, handed to the browser in
     *  the test-session ticket response. */
    VOICE_WS_PUBLIC_URL: z.string().default("ws://localhost:8787"),
    /** Lifetime of a test-session ticket (seconds) before the browser must connect. */
    VOICE_TEST_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(120),
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
      if (env.INTERNAL_SERVICE_TOKEN.startsWith("dev-insecure") || env.INTERNAL_HMAC_SECRET.startsWith("dev-insecure")) {
        ctx.addIssue({
          code: "custom",
          path: ["INTERNAL_SERVICE_TOKEN"],
          message: "INTERNAL_SERVICE_TOKEN and INTERNAL_HMAC_SECRET must be set to strong values in production",
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  return envSchema.parse(config);
}
