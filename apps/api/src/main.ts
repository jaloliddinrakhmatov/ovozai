import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { requestIdMiddleware } from "./common/request-id.middleware";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Correlation id on every request/response (before anything else).
  app.use(requestIdMiddleware);

  // Baseline security headers.
  app.use(helmet());

  const corsOrigins = (config.get<string>("CORS_ORIGINS") ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins, credentials: true });

  app.setGlobalPrefix("api/v1");
  app.enableShutdownHooks();

  const port = Number(config.get("API_PORT") ?? 3001);
  const host = config.get<string>("API_HOST") ?? "0.0.0.0";
  await app.listen(port, host);

  Logger.log(`OvozAI API ready at http://${host}:${port}/api/v1`, "Bootstrap");
}

void bootstrap();
