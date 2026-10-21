import type { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createEmbeddingProvider, type EmbeddingProvider } from "@ovozai/integrations";

/** DI token for the shared embedding provider. */
export const EMBEDDING_PROVIDER = Symbol("EMBEDDING_PROVIDER");

/**
 * Builds the embedding provider from env. MUST match the jobs-worker config so
 * query vectors and stored chunk vectors are comparable (same model + dims).
 * Defaults to the local deterministic embedder (no API key required).
 */
export const embeddingProvider: Provider = {
  provide: EMBEDDING_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService): EmbeddingProvider =>
    createEmbeddingProvider({
      provider: config.get<"local" | "openai">("EMBEDDING_PROVIDER") ?? "local",
      model: config.get<string>("EMBEDDING_MODEL"),
      dimensions: Number(config.get("EMBEDDING_DIMENSIONS") ?? 256),
      apiKey: config.get<string>("EMBEDDING_API_KEY"),
      baseUrl: config.get<string>("EMBEDDING_BASE_URL"),
    }),
};
