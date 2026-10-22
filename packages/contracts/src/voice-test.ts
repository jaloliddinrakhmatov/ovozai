import { z } from "zod";

/**
 * Browser "Test Agent" session (Phase: real-voice). The API issues a short-lived,
 * HMAC-signed ticket; the browser opens a WebSocket to the voice-worker gateway
 * with it, and the worker verifies the ticket and runs a real CallSession.
 */
export const testSessionResponseSchema = z.object({
  /** WebSocket URL of the voice-worker gateway. */
  wsUrl: z.string(),
  /** Opaque signed ticket: `<base64url(payload)>.<hmac>`; passed as `?ticket=`. */
  ticket: z.string(),
  agentId: z.string(),
  /** Ticket expiry (ISO) — the browser must connect before this. */
  expiresAt: z.iso.datetime(),
});
export type TestSessionResponse = z.infer<typeof testSessionResponseSchema>;

/** Messages the browser sends to the gateway over the WebSocket. */
export type VoiceClientMessage =
  | { type: "caller_text"; text: string; language?: string }
  | { type: "barge_in" }
  | { type: "hangup" };

/** Messages the gateway sends to the browser. */
export type VoiceServerMessage =
  | { type: "state"; state: "connecting" | "ready" | "in_call" | "ended" }
  | { type: "call"; callId: string }
  /** Session config: whether the server supplies spoken audio (real TTS). When
   *  true the browser plays `agent_audio`; when false it speaks captions itself. */
  | { type: "config"; serverAudio: boolean }
  | { type: "caption"; role: "AGENT" | "CALLER"; text: string; language?: string }
  /** Dev-bridge playback (no real audio) — the agent's spoken text. */
  | { type: "agent_audio_text"; text: string }
  /** Real synthesized audio for a turn (base64), e.g. NeuronAI WAV. */
  | { type: "agent_audio"; mime: string; dataBase64: string }
  | { type: "error"; message: string };
