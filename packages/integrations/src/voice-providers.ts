import type { SttProvider } from "./stt";
import type { LlmProvider } from "./llm";
import type { TtsProvider } from "./tts";
import { LocalRuleLlmProvider, LocalSttProvider, LocalTtsProvider } from "./providers-local";
import { OpenAiLlmProvider, OpenAiSttProvider, OpenAiTtsProvider } from "./providers-openai";

export interface VoiceProviders {
  stt: SttProvider;
  llm: LlmProvider;
  tts: TtsProvider;
}

type Modality = "local" | "openai";

export interface VoiceProviderConfig {
  /** Default provider for all three modalities (back-compat). */
  provider?: Modality;
  /** Per-modality overrides. Lets a deployment mix providers — e.g. a real
   *  OpenAI-compatible LLM (Groq/Gemini) with local/browser STT + TTS. */
  sttProvider?: Modality;
  llmProvider?: Modality;
  ttsProvider?: Modality;
  /** Shared credentials for the OpenAI-compatible adapters (OpenAI, Groq, …). */
  apiKey?: string;
  baseUrl?: string;
  sttModel?: string;
  llmModel?: string;
  ttsModel?: string;
}

/**
 * Build the STT/LLM/TTS provider set the voice-worker uses. Each modality is
 * selected independently (default: local deterministic providers, no key). The
 * OpenAI-compatible adapter (`openai`) also drives Groq / Gemini / any
 * OpenAI-compatible endpoint via `baseUrl` — see docs/MULTILINGUAL_EVALUATION.md.
 */
export function createVoiceProviders(config: VoiceProviderConfig = {}): VoiceProviders {
  const fallback = config.provider ?? "local";
  const sttKind = config.sttProvider ?? fallback;
  const llmKind = config.llmProvider ?? fallback;
  const ttsKind = config.ttsProvider ?? fallback;

  const key = config.apiKey;
  const requireKey = (kind: Modality, modality: string): void => {
    if (kind === "openai" && !key) {
      throw new Error(`Voice ${modality} provider 'openai' requires an API key`);
    }
  };
  requireKey(sttKind, "STT");
  requireKey(llmKind, "LLM");
  requireKey(ttsKind, "TTS");
  const base = { apiKey: key ?? "", baseUrl: config.baseUrl };

  return {
    stt: sttKind === "openai" ? new OpenAiSttProvider({ ...base, model: config.sttModel }) : new LocalSttProvider(),
    llm: llmKind === "openai" ? new OpenAiLlmProvider({ ...base, model: config.llmModel }) : new LocalRuleLlmProvider(),
    tts: ttsKind === "openai" ? new OpenAiTtsProvider({ ...base, model: config.ttsModel }) : new LocalTtsProvider(),
  };
}
