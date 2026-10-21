/**
 * OvozAI voice-worker — process bootstrap.
 *
 * Phase 4 ships the full real STT→LLM→TTS orchestration (see `./call-session`),
 * the provider adapters (`@ovozai/integrations`), and the authenticated internal
 * channel client (`./internal-client`). The **live media plane** (LiveKit room
 * audio) requires a LiveKit server + the native media SDK and is NOT wired in
 * this environment (see `./livekit-transport`). For a demonstrable, verifiable
 * run, set `VOICE_DEV_CALL_AGENT_ID` to drive one simulated call (scripted caller
 * turns) through the real pipeline and report it to the API.
 */
import { createVoiceProviders } from "@ovozai/integrations";
import { loadVoiceWorkerConfig, loadVoiceWorkerEnv } from "./config";
import { InternalApiClient } from "./internal-client";
import { CallSession } from "./call-session";
import { SimulatedTransport, type SimulatedCallerUtterance } from "./transport";

loadVoiceWorkerEnv();
const config = loadVoiceWorkerConfig();

const providers = createVoiceProviders({
  provider: config.voiceProvider,
  apiKey: config.providerApiKey,
  baseUrl: config.providerBaseUrl,
});
const internal = new InternalApiClient({
  baseUrl: config.apiBaseUrl,
  serviceToken: config.serviceToken,
  hmacSecret: config.hmacSecret,
});

/** Scripted caller turns for a dev simulated call (UZ/RU/EN + barge-in + goodbye). */
const DEMO_SCRIPT: SimulatedCallerUtterance[] = [
  { text: "What are your opening hours?", language: "en" },
  { text: "Режим работы в пятницу вечером?", language: "ru" },
  { text: "Ish vaqti juma kuni qanday?", language: "uz", bargeInAfterChunks: 1 },
  { text: "Thanks, goodbye", language: "en" },
];

async function runDevCall(agentId: string): Promise<void> {
  const created = await internal.createCall({
    agentId,
    direction: "INBOUND",
    fromE164: "+998900000000",
    toE164: "+998711111111",
  });
  const session = new CallSession({
    callId: created.callId,
    organizationId: created.organizationId,
    agent: created.agent,
    providers,
    internal,
    transport: new SimulatedTransport(DEMO_SCRIPT),
    logger: (message) => console.warn("[voice-worker]", message),
  });
  await session.run();
  console.info("[voice-worker] dev call %s complete (state=%s)", created.callId, session.currentState);
}

async function main(): Promise<void> {
  console.info("────────────────────────────────────────────────────────");
  console.info(" OvozAI voice-worker started");
  console.info(" providers: %s | api: %s", config.voiceProvider, config.apiBaseUrl);
  console.info("────────────────────────────────────────────────────────");

  const devAgentId = process.env.VOICE_DEV_CALL_AGENT_ID;
  if (devAgentId) {
    console.info("[voice-worker] running simulated dev call for agent %s", devAgentId);
    await runDevCall(devAgentId);
    process.exit(0);
  }

  if (config.livekitUrl) {
    console.info(
      "[voice-worker] LIVEKIT_URL is set, but the live media transport needs @livekit/rtc-node + a running server (see livekit-transport.ts). Idling.",
    );
  } else {
    console.info(
      "[voice-worker] Set VOICE_DEV_CALL_AGENT_ID to run a simulated call, or LIVEKIT_URL for live media. Idling.",
    );
  }

  const heartbeat = setInterval(() => {
    console.debug("[voice-worker] heartbeat — idle, awaiting dispatch");
  }, 30_000);

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info("[voice-worker] received %s — shutting down", signal);
    clearInterval(heartbeat);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main().catch((error) => {
  console.error("[voice-worker] fatal:", error instanceof Error ? error.message : error);
  process.exit(1);
});
