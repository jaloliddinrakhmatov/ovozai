import { createHash } from "node:crypto";

/**
 * Provider-agnostic embedding interface. Concrete providers turn text into dense
 * vectors; retrieval ranks chunks by cosine similarity (see docs/VOICE_PIPELINE.md
 * and the knowledge-base module).
 */
export interface EmbeddingProvider {
  /** Stable model identifier, stored alongside each vector for compatibility. */
  readonly model: string;
  /** Vector dimensionality. */
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

export interface EmbeddingProviderConfig {
  provider?: "local" | "openai";
  model?: string;
  dimensions?: number;
  apiKey?: string;
  baseUrl?: string;
}

const DEFAULT_LOCAL_DIM = 256;

function hashToBucket(feature: string, dim: number): number {
  const digest = createHash("sha1").update(feature).digest();
  return digest.readUInt32BE(0) % dim;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Cosine similarity, clamped to [0, 1]. Returns 0 for mismatched/zero vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  const score = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  return score < 0 ? 0 : score;
}

/**
 * Deterministic, dependency-free **local lexical** embedder: a real text→vector
 * function (hashed bag of words + character trigrams, L2-normalized) used as the
 * no-API-key default for development and tests. It is lexical, not semantic —
 * same-language keyword overlap drives similarity — which is sufficient to make
 * the ingestion + retrieval pipeline genuinely functional and verifiable offline.
 * Swap in {@link HttpEmbeddingProvider} by configuring a real provider.
 */
export class LocalLexicalEmbeddingProvider implements EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;

  constructor(dimensions: number = DEFAULT_LOCAL_DIM) {
    this.dimensions = dimensions;
    this.model = `local-lexical-v1-${dimensions}`;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.embedOne(text));
  }

  private embedOne(text: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);
    const add = (feature: string, weight: number): void => {
      const bucket = hashToBucket(feature, this.dimensions);
      vector[bucket] = (vector[bucket] ?? 0) + weight;
    };
    for (const word of tokenize(text)) {
      add(`w:${word}`, 1);
      const padded = `#${word}#`;
      for (let i = 0; i + 3 <= padded.length; i += 1) {
        add(`t:${padded.slice(i, i + 3)}`, 0.5);
      }
    }
    let norm = 0;
    for (const value of vector) norm += value * value;
    norm = Math.sqrt(norm) || 1;
    return vector.map((value) => value / norm);
  }
}

/** OpenAI-compatible HTTP embedding provider. Requires an API key (prod use). */
export class HttpEmbeddingProvider implements EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: EmbeddingProviderConfig) {
    this.model = config.model ?? "text-embedding-3-small";
    this.dimensions = config.dimensions ?? 1536;
    this.apiKey = config.apiKey ?? "";
    this.baseUrl = (config.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!response.ok) {
      throw new Error(`Embedding provider error ${response.status}: ${await response.text()}`);
    }
    const json = (await response.json()) as { data: Array<{ embedding: number[] }> };
    return json.data.map((item) => item.embedding);
  }
}

/** Build an embedding provider from config; defaults to the local embedder. */
export function createEmbeddingProvider(config: EmbeddingProviderConfig = {}): EmbeddingProvider {
  if (config.provider === "openai") {
    return new HttpEmbeddingProvider(config);
  }
  return new LocalLexicalEmbeddingProvider(config.dimensions ?? DEFAULT_LOCAL_DIM);
}
