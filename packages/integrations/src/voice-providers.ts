import type { SttProvider } from "./stt";
import type { LlmProvider } from "./llm";
import type { TtsProvider } from "./tts";
import { LocalRuleLlmProvider, LocalSttProvider, LocalTtsProvider } from "./providers-local";
import { OpenAiLlmProvider, OpenAiSttProvider, OpenAiTtsProvider } from "./providers-openai";
import { NeuronAiSttProvider, NeuronAiTtsProvider } from "./providers-neuronai";

export interface VoiceProviders {
  stt: SttProvider;
  llm: LlmProvider;
  tts: TtsProvider;
}

type Modality = "local" | "openai";
/** STT and TTS additionally support NeuronAI's native (non-OpenAI) Uzbek voice. */
type TtsModality = Modality | "neuronai";
type SttModality = Modality | "neuronai";

export interface VoiceProviderConfig {
  /** Default provider for all three modalities (back-compat). */
  provider?: Modality;
  /** Per-modality overrides. Lets a deployment mix providers — e.g. a real
   *  OpenAI-compatible LLM (Groq/Gemini) with NeuronAI TTS + browser STT. */
  sttProvider?: SttModality;
  llmProvider?: Modality;
  ttsProvider?: TtsModality;
  /** Shared credentials for the OpenAI-compatible adapters (OpenAI, Groq, …).
   *  Used as the fallback when a per-modality key/URL is not given. */
  apiKey?: string;
  baseUrl?: string;
  /** Per-modality credentials — so different modalities can use different
   *  providers (e.g. Groq LLM + NeuronAI TTS), each with its own key + endpoint. */
  sttApiKey?: string;
  sttBaseUrl?: string;
  llmApiKey?: string;
  llmBaseUrl?: string;
  ttsApiKey?: string;
  ttsBaseUrl?: string;
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
  const sttKind: SttModality = config.sttProvider ?? fallback;
  const llmKind = config.llmProvider ?? fallback;
  const ttsKind: TtsModality = config.ttsProvider ?? fallback;

  // Resolve each modality's credentials, falling back to the shared key/URL.
  const cred = (modality: string, apiKey: string | undefined, baseUrl: string | undefined) => {
    const resolvedKey = apiKey ?? config.apiKey;
    if (!resolvedKey) {
      throw new Error(`Voice ${modality} provider 'openai' requires an API key`);
    }
    return { apiKey: resolvedKey, baseUrl: baseUrl ?? config.baseUrl };
  };

  return {
    stt:
      sttKind === "neuronai"
        ? new NeuronAiSttProvider({
            apiKey: cred("STT", config.sttApiKey, config.sttBaseUrl).apiKey,
            baseUrl: config.sttBaseUrl ?? config.baseUrl,
          })
        : sttKind === "openai"
          ? new OpenAiSttProvider({ ...cred("STT", config.sttApiKey, config.sttBaseUrl), model: config.sttModel })
          : new LocalSttProvider(),
    llm:
      llmKind === "openai"
        ? new OpenAiLlmProvider({ ...cred("LLM", config.llmApiKey, config.llmBaseUrl), model: config.llmModel })
        : new LocalRuleLlmProvider(),
    tts:
      ttsKind === "neuronai"
        ? new NeuronAiTtsProvider({
            apiKey: cred("TTS", config.ttsApiKey, config.ttsBaseUrl).apiKey,
            baseUrl: config.ttsBaseUrl ?? config.baseUrl,
            voiceId: config.ttsModel,
          })
        : ttsKind === "openai"
          ? new OpenAiTtsProvider({ ...cred("TTS", config.ttsApiKey, config.ttsBaseUrl), model: config.ttsModel })
          : new LocalTtsProvider(),
  };
}
