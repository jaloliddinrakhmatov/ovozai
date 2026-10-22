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
  /** LiveKit server URL — required only for the live media transport (Phase 4+). */
  livekitUrl: string;
  /** Provider selection for STT/LLM/TTS. "local" needs no keys. */
  voiceProvider: "local" | "openai";
  providerApiKey?: string;
  providerBaseUrl?: string;
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
    voiceProvider: process.env.VOICE_PROVIDER === "openai" ? "openai" : "local",
    providerApiKey: process.env.VOICE_PROVIDER_API_KEY,
    providerBaseUrl: process.env.VOICE_PROVIDER_BASE_URL,
    maxConcurrentSessions: Number(process.env.VOICE_WORKER_MAX_SESSIONS ?? 10),
    wsPort: Number(process.env.VOICE_WS_PORT ?? 8787),
    logLevel: process.env.LOG_LEVEL ?? "info",
  };
}
