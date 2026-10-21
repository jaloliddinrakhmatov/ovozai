/**
 * OvozAI voice-worker — process bootstrap (Phase 1 scaffold).
 *
 * This is the ONLY module in the package with side effects: it loads config,
 * prints a banner, installs signal handlers, and keeps the process alive like a
 * long-lived worker. All unit-testable logic lives in sibling modules (e.g.
 * `./config`) so tests never import this file and never start the service.
 *
 * Phase 1 deliberately connects to NOTHING. The real LiveKit SIP/room handling —
 * joining rooms, bridging PSTN audio, and driving the STT -> LLM -> TTS pipeline —
 * arrives in Phase 4. See ../../docs/VOICE_PIPELINE.md for the target design.
 */

import { loadVoiceWorkerConfig } from "./config";

// Phase-4 boundary (see ../../docs/VOICE_PIPELINE.md): the real voice agent will
// assemble its pipeline from these provider adapters supplied by
// @ovozai/integrations. Imported type-only and re-exported purely to document
// the contract this scaffold will fulfil — no runtime dependency yet.
import type { SttProvider, LlmProvider, TtsProvider } from "@ovozai/integrations";

/** The provider trio a real voice session will be constructed from in Phase 4. */
export type VoicePipelineProviders = {
  stt: SttProvider;
  llm: LlmProvider;
  tts: TtsProvider;
};

/** Heartbeat cadence for the keep-alive log line, in milliseconds. */
const HEARTBEAT_INTERVAL_MS = 30_000;

function main(): void {
  const config = loadVoiceWorkerConfig();

  console.info("────────────────────────────────────────────────────────");
  console.info(" OvozAI voice-worker scaffold started (Phase 1)");
  console.info(" Real LiveKit SIP/room handling arrives in Phase 4.");
  console.info(" See docs/VOICE_PIPELINE.md for the target design.");
  console.info("────────────────────────────────────────────────────────");
  console.info(" config: %o", {
    livekitUrl: config.livekitUrl || "(unset)",
    maxConcurrentSessions: config.maxConcurrentSessions,
    logLevel: config.logLevel,
  });
  console.info(" Phase 1 does not connect to any external service.");

  // Keep the event loop alive so the service behaves like a long-lived worker.
  // Intentionally NOT unref()'d — this handle is what keeps the process running
  // until a shutdown signal is received.
  const heartbeat = setInterval(() => {
    console.debug("[voice-worker] heartbeat — idle scaffold, awaiting Phase 4");
  }, HEARTBEAT_INTERVAL_MS);

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.info("[voice-worker] received %s — shutting down", signal);
    clearInterval(heartbeat);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
