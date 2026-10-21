import type { AudioChunk, LanguageCode, ProviderConfig } from "./types";

export interface TtsOptions extends ProviderConfig {
  /** Provider voice identifier. */
  voiceId: string;
  language: LanguageCode;
  /** Playback rate multiplier (1.0 = normal). */
  speed?: number;
}

/**
 * Streaming text-to-speech provider. Synthesis must be cancellable so the
 * voice-worker can interrupt playback on caller barge-in
 * (see docs/VOICE_PIPELINE.md).
 */
export interface TtsProvider {
  readonly name: string;
  synthesize(
    text: AsyncIterable<string> | string,
    options: TtsOptions,
    signal?: AbortSignal,
  ): AsyncIterable<AudioChunk>;
}
