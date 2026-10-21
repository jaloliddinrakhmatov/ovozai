/**
 * Voice-worker configuration (Phase 1 scaffold).
 *
 * Pure, side-effect-free env reader. Importing this module must NOT start the
 * service or open any connection — only `src/main.ts` does that. Keeping config
 * loading pure lets it be unit-tested in isolation.
 */

/** Typed, resolved configuration for the OvozAI voice worker. */
export interface VoiceWorkerConfig {
  /** LiveKit server URL (wired up for real in Phase 4). Empty when unset. */
  livekitUrl: string;
  /** Upper bound on concurrent realtime voice sessions this worker will accept. */
  maxConcurrentSessions: number;
  /** Logging verbosity, e.g. "debug" | "info" | "warn" | "error". */
  logLevel: string;
}

/**
 * Read the voice-worker configuration from the environment, applying sensible
 * defaults. Pure: no side effects, safe to call from tests.
 */
export function loadVoiceWorkerConfig(): VoiceWorkerConfig {
  return {
    livekitUrl: process.env.LIVEKIT_URL ?? "",
    maxConcurrentSessions: Number(process.env.VOICE_WORKER_MAX_SESSIONS ?? 10),
    logLevel: process.env.LOG_LEVEL ?? "info",
  };
}
