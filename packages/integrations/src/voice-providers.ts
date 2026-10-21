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

export interface VoiceProviderConfig {
  provider?: "local" | "openai";
  apiKey?: string;
  baseUrl?: string;
  sttModel?: string;
  llmModel?: string;
  ttsModel?: string;
}

/**
 * Build the STT/LLM/TTS provider set the voice-worker uses. Defaults to the
 * local deterministic providers (no API key); `provider: "openai"` returns the
 * real HTTP adapters.
 */
export function createVoiceProviders(config: VoiceProviderConfig = {}): VoiceProviders {
  if (config.provider === "openai") {
    if (!config.apiKey) {
      throw new Error("Voice provider 'openai' requires an API key");
    }
    const base = { apiKey: config.apiKey, baseUrl: config.baseUrl };
    return {
      stt: new OpenAiSttProvider({ ...base, model: config.sttModel }),
      llm: new OpenAiLlmProvider({ ...base, model: config.llmModel }),
      tts: new OpenAiTtsProvider({ ...base, model: config.ttsModel }),
    };
  }
  return {
    stt: new LocalSttProvider(),
    llm: new LocalRuleLlmProvider(),
    tts: new LocalTtsProvider(),
  };
}
