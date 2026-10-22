import type { AudioChunk } from "./types";
import type { TtsOptions, TtsProvider } from "./tts";

/**
 * NeuronAI native Uzbek text-to-speech (my.neuronai.uz). NOT OpenAI-compatible —
 * `POST /tts/synthesize { text, voice_id, language }` returns WAV bytes. Uzbek
 * voices: kamron, madina, saodat, kamola, muhriddin (+ ru/en). Billed per char.
 */
const DEFAULT_BASE = "https://my.neuronai.uz/api/v1";
const DEFAULT_VOICE: Record<string, string> = { uz: "kamron", ru: "olga", en: "sophia" };

export interface NeuronAiTtsConfig {
  apiKey: string;
  baseUrl?: string;
  /** Default voice id; when unset the voice is chosen by the turn's language. */
  voiceId?: string;
}

async function collect(text: AsyncIterable<string> | string): Promise<string> {
  if (typeof text === "string") return text;
  let full = "";
  for await (const part of text) full += part;
  return full;
}

export class NeuronAiTtsProvider implements TtsProvider {
  readonly name = "neuronai-tts";
  constructor(private readonly config: NeuronAiTtsConfig) {}

  async *synthesize(
    text: AsyncIterable<string> | string,
    options: TtsOptions,
    signal?: AbortSignal,
  ): AsyncIterable<AudioChunk> {
    const full = (await collect(text)).trim();
    if (!full) return;
    const base = (this.config.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    const voiceId =
      options.voiceId && options.voiceId !== "default"
        ? options.voiceId
        : (this.config.voiceId ?? DEFAULT_VOICE[options.language] ?? DEFAULT_VOICE.uz!);

    const response = await fetch(`${base}/tts/synthesize`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.config.apiKey}` },
      body: JSON.stringify({ text: full, voice_id: voiceId, language: options.language }),
      signal,
    });
    if (!response.ok) {
      throw new Error(`NeuronAI TTS ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    yield { data: bytes, sampleRate: 24000, encoding: "wav" };
  }
}
