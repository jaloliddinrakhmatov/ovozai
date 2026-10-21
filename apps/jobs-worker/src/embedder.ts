import { createEmbeddingProvider, type EmbeddingProvider } from "@ovozai/integrations";

/**
 * Build the embedding provider from env. MUST match the API's config so the
 * vectors produced here are comparable to query vectors at retrieval time.
 */
export function createEmbedderFromEnv(): EmbeddingProvider {
  const provider = process.env.EMBEDDING_PROVIDER === "openai" ? "openai" : "local";
  return createEmbeddingProvider({
    provider,
    model: process.env.EMBEDDING_MODEL,
    dimensions: Number(process.env.EMBEDDING_DIMENSIONS ?? 256),
    apiKey: process.env.EMBEDDING_API_KEY,
    baseUrl: process.env.EMBEDDING_BASE_URL,
  });
}
