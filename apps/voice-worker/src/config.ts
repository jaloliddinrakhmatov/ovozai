/**
 * Voice-worker configuration — a pure, side-effect-free env reader (safe to call
 * from tests). Only `src/main.ts` has side effects.
 */
import { config as loadEnv } from "dotenv";

export interface VoiceWorkerConfig {
  /** Base URL of the control-plane API (for the internal channel). */
  apiBaseUrl: string;
  /** Internal-channel service token + HMAC secret (must match the API). */
  serviceToken: string;
  hmacSecret: string;
  /** LiveKit server URL + API credentials — for the live media (SIP) transport. */
  livekitUrl: string;
  livekitApiKey?: string;
  livekitApiSecret?: string;
  /** Dev: a room to join + agent to run on startup, to test one live call. */
  livekitDevRoom?: string;
  livekitDevAgentId?: string;
  /** Provider selection for STT/LLM/TTS. "local" needs no keys. */
  voiceProvider: "local" | "openai";
  /** Per-modality overrides (default to voiceProvider). Lets a deployment run a
   *  real OpenAI-compatible LLM (e.g. Groq) with local/browser STT + TTS. */
  sttProvider?: "local" | "openai" | "neuronai";
  llmProvider?: "local" | "openai";
  ttsProvider?: "local" | "openai" | "neuronai";
  providerApiKey?: string;
  providerBaseUrl?: string;
  /** Per-modality credentials (default to providerApiKey/providerBaseUrl), so a
   *  separate TTS/STT provider (e.g. NeuronAI) can run alongside the LLM (Groq). */
  sttApiKey?: string;
  sttBaseUrl?: string;
  llmApiKey?: string;
  llmBaseUrl?: string;
  ttsApiKey?: string;
  ttsBaseUrl?: string;
  sttModel?: string;
  llmModel?: string;
  ttsModel?: string;
  maxConcurrentSessions: number;
  /** Port for the browser "Test Agent" WebSocket gateway. */
  wsPort: number;
  logLevel: string;
}

/** Load env from cwd then the monorepo root (dotenv does not override). */
export function loadVoiceWorkerEnv(): void {
  loadEnv();
  loadEnv({ path: "../../.env" });
}

export function loadVoiceWorkerConfig(): VoiceWorkerConfig {
  return {
    apiBaseUrl: process.env.VOICE_API_URL ?? process.env.APP_API_URL ?? "http://localhost:3001",
    serviceToken: process.env.INTERNAL_SERVICE_TOKEN ?? "dev-insecure-service-token-change-me",
    hmacSecret: process.env.INTERNAL_HMAC_SECRET ?? "dev-insecure-hmac-secret-change-me-0123456789",
    livekitUrl: process.env.LIVEKIT_URL ?? "",
    livekitApiKey: process.env.LIVEKIT_API_KEY,
    livekitApiSecret: process.env.LIVEKIT_API_SECRET,
    livekitDevRoom: process.env.LIVEKIT_DEV_ROOM,
    livekitDevAgentId: process.env.LIVEKIT_DEV_AGENT_ID,
    voiceProvider: process.env.VOICE_PROVIDER === "openai" ? "openai" : "local",
    sttProvider:
      process.env.VOICE_STT_PROVIDER === "neuronai"
        ? "neuronai"
        : process.env.VOICE_STT_PROVIDER === "openai"
          ? "openai"
          : process.env.VOICE_STT_PROVIDER === "local"
            ? "local"
            : undefined,
    llmProvider: process.env.VOICE_LLM_PROVIDER === "openai" ? "openai" : process.env.VOICE_LLM_PROVIDER === "local" ? "local" : undefined,
    ttsProvider:
      process.env.VOICE_TTS_PROVIDER === "neuronai"
        ? "neuronai"
        : process.env.VOICE_TTS_PROVIDER === "openai"
          ? "openai"
          : process.env.VOICE_TTS_PROVIDER === "local"
            ? "local"
            : undefined,
    providerApiKey: process.env.VOICE_PROVIDER_API_KEY,
    providerBaseUrl: process.env.VOICE_PROVIDER_BASE_URL,
    sttApiKey: process.env.VOICE_STT_API_KEY,
    sttBaseUrl: process.env.VOICE_STT_BASE_URL,
    llmApiKey: process.env.VOICE_LLM_API_KEY,
    llmBaseUrl: process.env.VOICE_LLM_BASE_URL,
    ttsApiKey: process.env.VOICE_TTS_API_KEY,
    ttsBaseUrl: process.env.VOICE_TTS_BASE_URL,
    sttModel: process.env.VOICE_STT_MODEL,
    llmModel: process.env.VOICE_LLM_MODEL,
    ttsModel: process.env.VOICE_TTS_MODEL,
    maxConcurrentSessions: Number(process.env.VOICE_WORKER_MAX_SESSIONS ?? 10),
    wsPort: Number(process.env.VOICE_WS_PORT ?? 8787),
    logLevel: process.env.LOG_LEVEL ?? "info",
  };
}
