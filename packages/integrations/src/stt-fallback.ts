import type { AudioChunk } from "./types";
import type { SttOptions, SttProvider, SttResult } from "./stt";

async function* replay(frames: AudioChunk[]): AsyncIterable<AudioChunk> {
  for (const frame of frames) yield frame;
}

/**
 * Compose several STT providers into a fallback chain (docs/VOICE_PIPELINE.md §5.4,
 * §9): try each in order; on error (or no final result) fail over to the next, so
 * a single-provider outage does not drop the turn. The audio is buffered once so
 * it can be re-fed to the next provider (a small latency cost accepted for the
 * hard Uzbek case). Racing is a later optimization.
 */
export function createFallbackStt(
  providers: SttProvider[],
  name = "fallback-stt",
): SttProvider {
  if (providers.length === 0) {
    throw new Error("createFallbackStt requires at least one provider");
  }
  return {
    name,
    async *transcribe(audio: AsyncIterable<AudioChunk>, options: SttOptions): AsyncIterable<SttResult> {
      const frames: AudioChunk[] = [];
      for await (const frame of audio) frames.push(frame);

      for (let i = 0; i < providers.length; i += 1) {
        const provider = providers[i]!;
        const buffered: SttResult[] = [];
        let sawFinal = false;
        try {
          for await (const result of provider.transcribe(replay(frames), options)) {
            buffered.push(result);
            if (result.isFinal) sawFinal = true;
          }
        } catch (error) {
          if (i === providers.length - 1) throw error;
          continue; // fail over to the next provider
        }
        if (sawFinal) {
          for (const result of buffered) yield result;
          return;
        }
        // No final from this provider; try the next (unless it was the last).
      }
    },
  };
}
