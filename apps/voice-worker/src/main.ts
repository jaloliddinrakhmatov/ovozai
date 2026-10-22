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
import { createStorageProvider, createVoiceProviders } from "@ovozai/integrations";
import { loadVoiceWorkerConfig, loadVoiceWorkerEnv } from "./config";
import { InternalApiClient } from "./internal-client";
import { CallSession } from "./call-session";
import { SimulatedTransport, type SimulatedCallerUtterance } from "./transport";
import { startVoiceGateway } from "./gateway";

loadVoiceWorkerEnv();
const config = loadVoiceWorkerConfig();

const providers = createVoiceProviders({
  provider: config.voiceProvider,
  sttProvider: config.sttProvider,
  llmProvider: config.llmProvider,
  ttsProvider: config.ttsProvider,
  apiKey: config.providerApiKey,
  baseUrl: config.providerBaseUrl,
  sttApiKey: config.sttApiKey,
  sttBaseUrl: config.sttBaseUrl,
  llmApiKey: config.llmApiKey,
  llmBaseUrl: config.llmBaseUrl,
  ttsApiKey: config.ttsApiKey,
  ttsBaseUrl: config.ttsBaseUrl,
  sttModel: config.sttModel,
  llmModel: config.llmModel,
  ttsModel: config.ttsModel,
});
const storage = createStorageProvider({
  provider: process.env.STORAGE_PROVIDER === "s3" ? "s3" : "local",
  baseDir: process.env.STORAGE_LOCAL_DIR,
  bucket: process.env.STORAGE_S3_BUCKET,
  region: process.env.STORAGE_S3_REGION,
  endpoint: process.env.STORAGE_S3_ENDPOINT,
});
const internal = new InternalApiClient({
  baseUrl: config.apiBaseUrl,
  serviceToken: config.serviceToken,
  hmacSecret: config.hmacSecret,
});

/** Scripted caller turns for dev simulated calls. */
const DEMO_SCRIPTS: Record<string, SimulatedCallerUtterance[]> = {
  qa: [
    { text: "What are your opening hours?", language: "en" },
    { text: "Режим работы в пятницу вечером?", language: "ru" },
    { text: "Ish vaqti juma kuni qanday?", language: "uz", bargeInAfterChunks: 1 },
    { text: "Thanks, goodbye", language: "en" },
  ],
  transfer: [{ text: "Please connect me to a human operator", language: "en" }],
};

async function runDevCall(agentId: string, mode: string): Promise<void> {
  const script = DEMO_SCRIPTS[mode] ?? DEMO_SCRIPTS.qa!;
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
    transport: new SimulatedTransport(script),
    storage,
    llmModel: config.llmModel,
    logger: (message) => console.warn("[voice-worker]", message),
  });
  await session.run();
  console.info("[voice-worker] dev call %s complete (state=%s)", created.callId, session.currentState);
}

async function main(): Promise<void> {
  console.info("────────────────────────────────────────────────────────");
  console.info(" OvozAI voice-worker started");
  console.info(
    " providers: stt=%s llm=%s tts=%s | api: %s",
    config.sttProvider ?? config.voiceProvider,
    config.llmProvider ?? config.voiceProvider,
    config.ttsProvider ?? config.voiceProvider,
    config.apiBaseUrl,
  );
  console.info("────────────────────────────────────────────────────────");

  const devAgentId = process.env.VOICE_DEV_CALL_AGENT_ID;
  if (devAgentId) {
    const mode = process.env.VOICE_DEV_CALL_MODE ?? "qa";
    console.info("[voice-worker] running simulated dev call (mode=%s) for agent %s", mode, devAgentId);
    await runDevCall(devAgentId, mode);
    process.exit(0);
  }

  // Browser "Test Agent" gateway: serve real WebSocket voice sessions. This keeps
  // the process alive. (A one-shot VOICE_DEV_CALL_AGENT_ID run above exits before
  // reaching here; LiveKit SIP media is still a documented, unwired boundary.)
  // When TTS is a real provider (NeuronAI/OpenAI), the server supplies audio for
  // the browser to play; otherwise the browser speaks the text itself.
  const ttsKind = config.ttsProvider ?? config.voiceProvider;
  const serverAudio = ttsKind === "neuronai" || ttsKind === "openai";
  // Server-side STT is the OpenAI-compatible transcription path (e.g. Groq Whisper).
  const sttKind = config.sttProvider ?? config.voiceProvider;
  const sttServer = sttKind === "openai";
  const gateway = startVoiceGateway({
    port: config.wsPort,
    hmacSecret: config.hmacSecret,
    internal,
    providers,
    storage,
    llmModel: config.llmModel,
    serverAudio,
    sttServer,
    maxSessions: config.maxConcurrentSessions,
    logger: (message) => console.warn("[voice-worker]", message),
  });
  console.info("[voice-worker] Test-Agent gateway ready on ws://0.0.0.0:%d", config.wsPort);
  if (config.livekitUrl) {
    console.info(
      "[voice-worker] LIVEKIT_URL is set, but the live SIP media transport needs @livekit/rtc-node + a server (see livekit-transport.ts).",
    );
  }

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info("[voice-worker] received %s — shutting down", signal);
    gateway.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main().catch((error) => {
  console.error("[voice-worker] fatal:", error instanceof Error ? error.message : error);
  process.exit(1);
});
