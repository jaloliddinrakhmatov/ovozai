import type { AudioChunk, LanguageCode, ProviderConfig } from "./types";

/** A single transcription hypothesis from a speech-to-text provider. */
export interface SttResult {
  /** The (partial or final) transcript text. */
  transcript: string;
  /** True once the provider has finalized this segment. */
  isFinal: boolean;
  /** Overall confidence 0..1, when the provider reports it. */
  confidence?: number;
  /** Detected language, useful for Uzbek/Russian code-switching. */
  detectedLanguage?: LanguageCode;
}

export interface SttOptions extends ProviderConfig {
  /** Candidate languages; order expresses preference. */
  languages: LanguageCode[];
  /** Domain vocabulary / phrase boosting for proper nouns, menu items, etc. */
  vocabulary?: string[];
}

/**
 * Streaming speech-to-text provider. Implementations consume audio chunks and
 * yield partial then final results. Multiple providers can be raced or chained
 * for fallback — critical for low-resource Uzbek ASR (see docs/VOICE_PIPELINE.md).
 */
export interface SttProvider {
  readonly name: string;
  transcribe(audio: AsyncIterable<AudioChunk>, options: SttOptions): AsyncIterable<SttResult>;
}
