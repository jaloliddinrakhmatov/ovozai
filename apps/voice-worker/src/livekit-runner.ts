import type { LlmProvider, SttProvider, StorageProvider, TtsProvider } from "@ovozai/integrations";
import { CallSession } from "./call-session";
import { LiveKitTransport, type InboundFrame, type MediaIO } from "./livekit-transport";
import type { VoiceInternalClient } from "./internal-client";

/** 16 kHz mono is ideal for ASR; 48 kHz mono is LiveKit's native playback rate. */
const STT_RATE = 16000;
const OUT_RATE = 48000;

export interface LiveKitCallOptions {
  url: string;
  apiKey: string;
  apiSecret: string;
  /** The room the SIP/media call lives in. */
  roomName: string;
  identity?: string;
  /** Route by agent id (dev dispatch) or dialed number (SIP inbound). */
  agentId?: string;
  toE164?: string;
  fromE164?: string;
  internal: VoiceInternalClient;
  providers: { stt: SttProvider; llm: LlmProvider; tts: TtsProvider };
  storage?: StorageProvider;
  llmModel?: string;
  logger?: (message: string) => void;
}

/**
 * Join a LiveKit room, bridge its audio to a {@link CallSession}, and run one
 * call to completion. The SDK is imported dynamically so the worker builds and
 * runs without the native `@livekit/rtc-node` dependency installed; this path is
 * only reached when LiveKit is configured. Validate the SDK calls against your
 * installed version before production (see docs/SIP_INTEGRATION.md).
 */
export async function runLiveKitCall(opts: LiveKitCallOptions): Promise<void> {
  const log = opts.logger ?? (() => {});
  const rtc = await import("@livekit/rtc-node");
  const { AccessToken } = await import("livekit-server-sdk");
  const { Room, RoomEvent, AudioStream, AudioSource, LocalAudioTrack, AudioFrame, TrackPublishOptions } = rtc;

  // Mint a join token for the agent participant.
  const at = new AccessToken(opts.apiKey, opts.apiSecret, { identity: opts.identity ?? "ovozai-agent", ttl: 3600 });
  at.addGrant({ roomJoin: true, room: opts.roomName, canPublish: true, canSubscribe: true });
  const token = await at.toJwt();

  const room = new Room();
  let disconnected = false;
  let resolveTrack: ((track: unknown) => void) | null = null;
  const callerTrack = new Promise<unknown>((resolve) => {
    resolveTrack = resolve;
  });

  room.on(RoomEvent.TrackSubscribed, (...args: unknown[]) => {
    // (track, publication, participant) — take the first subscribed audio track as the caller.
    if (resolveTrack) {
      resolveTrack(args[0]);
      resolveTrack = null;
    }
  });
  room.on(RoomEvent.Disconnected, () => {
    disconnected = true;
  });

  await room.connect(opts.url, token, { autoSubscribe: true, dynacast: false });
  log(`livekit: connected to room ${opts.roomName}`);

  // Outbound: publish an audio source the agent speaks through.
  const source = new AudioSource(OUT_RATE, 1);
  const localTrack = LocalAudioTrack.createAudioTrack("agent-voice", source);
  await room.localParticipant?.publishTrack(localTrack, new TrackPublishOptions());

  const track = await callerTrack;

  const inbound = (async function* (): AsyncIterable<InboundFrame> {
    const stream = new AudioStream(track, STT_RATE, 1);
    for await (const frame of stream) {
      if (disconnected) break;
      yield { data: frame.data, sampleRate: frame.sampleRate ?? STT_RATE };
    }
  })();

  const io: MediaIO = {
    inbound,
    outboundSampleRate: OUT_RATE,
    capture: async (frame) => {
      await source.captureFrame(new AudioFrame(frame, OUT_RATE, 1, frame.length));
    },
    close: async () => {
      await room.disconnect().catch(() => undefined);
    },
  };

  const created = await opts.internal.createCall({
    agentId: opts.agentId,
    toE164: opts.toE164,
    fromE164: opts.fromE164,
    direction: "INBOUND",
  });

  const transport = new LiveKitTransport(io, { sttSampleRate: STT_RATE });
  const session = new CallSession({
    callId: created.callId,
    organizationId: created.organizationId,
    agent: created.agent,
    providers: opts.providers,
    internal: opts.internal,
    transport,
    storage: opts.storage,
    llmModel: opts.llmModel,
    logger: opts.logger,
  });

  try {
    await session.run();
  } finally {
    await room.disconnect().catch(() => undefined);
    log(`livekit: call ${created.callId} ended`);
  }
}
