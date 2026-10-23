import "reflect-metadata";
import { Logger, RequestMethod } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { requestIdMiddleware } from "./common/request-id.middleware";
import { StructuredLogger } from "./common/structured-logger";

async function bootstrap(): Promise<void> {
  // rawBody is required so the internal channel can verify the HMAC signature
  // over the exact request bytes.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  // Observability (Phase 7): structured, PII-redacted JSON logs for aggregation.
  // LOG_FORMAT=json forces it; otherwise it is the default only in production.
  const logFormat =
    config.get<string>("LOG_FORMAT") ??
    (config.get<string>("NODE_ENV") === "production" ? "json" : "pretty");
  if (logFormat === "json") {
    app.useLogger(new StructuredLogger());
  }

  // Correlation id on every request/response (before anything else).
  app.use(requestIdMiddleware);

  // Baseline security headers.
  app.use(helmet());

  const corsOrigins = (config.get<string>("CORS_ORIGINS") ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins, credentials: true });

  // Public API under /api/v1; the internal voice-worker channel keeps its own
  // /internal/v1 prefix (excluded here).
  app.setGlobalPrefix("api/v1", {
    exclude: [
      { path: "internal/v1/calls", method: RequestMethod.ALL },
      { path: "internal/v1/calls/:id", method: RequestMethod.ALL },
      { path: "internal/v1/calls/:id/events", method: RequestMethod.ALL },
      { path: "internal/v1/calls/:id/transcript", method: RequestMethod.ALL },
      { path: "internal/v1/calls/:id/usage", method: RequestMethod.ALL },
      { path: "internal/v1/calls/:id/wer", method: RequestMethod.ALL },
      // Every internal tool route must be listed here, or it inherits the
      // `api/v1` prefix instead of staying under `/internal/v1`.
      { path: "internal/v1/calls/:id/tools/knowledge-retrieval", method: RequestMethod.ALL },
      { path: "internal/v1/calls/:id/tools/book-appointment", method: RequestMethod.ALL },
      { path: "internal/v1/calls/:id/tools/check-availability", method: RequestMethod.ALL },
      { path: "internal/v1/calls/:id/tools/reschedule-appointment", method: RequestMethod.ALL },
      { path: "internal/v1/calls/:id/tools/cancel-appointment", method: RequestMethod.ALL },
      { path: "internal/v1/calls/:id/tools/transfer", method: RequestMethod.ALL },
    ],
  });
  app.enableShutdownHooks();

  // PaaS hosts (Render, Railway, …) inject the bind port as PORT; fall back to
  // the explicit API_PORT, then the local default.
  const port = Number(process.env.PORT ?? config.get("API_PORT") ?? 3001);
  const host = config.get<string>("API_HOST") ?? "0.0.0.0";
  await app.listen(port, host);

  Logger.log(`OvozAI API ready at http://${host}:${port}/api/v1`, "Bootstrap");
}

void bootstrap();
