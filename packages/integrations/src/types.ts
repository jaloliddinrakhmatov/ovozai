/**
 * Provider-agnostic primitives shared by the STT / LLM / TTS adapters.
 * These interfaces define the boundary (see docs/VOICE_PIPELINE.md); concrete
 * provider implementations land in Phase 4.
 */

/** BCP-47-ish language codes the platform targets first. */
export type LanguageCode = "uz" | "ru" | "en" | (string & {});

/** PCM/Opus audio frame flowing to/from the telephony media plane. */
export interface AudioChunk {
  /** Raw encoded audio bytes. */
  data: Uint8Array;
  /** Sample rate in Hz (e.g. 8000 for PSTN, 16000/48000 for wideband). */
  sampleRate: number;
  /** Encoding of `data`. */
  encoding: "pcm16" | "opus" | "mulaw" | "wav";
}

/** Common shape for a streaming provider result with a terminal signal. */
export interface StreamChunk<T> {
  value: T;
  /** True on the last chunk of the stream. */
  done: boolean;
}

/** Base configuration every provider adapter accepts. */
export interface ProviderConfig {
  /** Credential/secret reference resolved from the secret store, never inline. */
  secretRef?: string;
  /** Preferred region (data-residency aware — see docs/SECURITY.md). */
  region?: string;
}
