import type { AudioTransport } from "./transport";

/**
 * Live media transport over LiveKit (docs/VOICE_PIPELINE.md §1, §4.1).
 *
 * The orchestrator (`CallSession`) is transport-agnostic; this is where the real
 * media plane plugs in: join the LiveKit room, subscribe to the caller's audio
 * track, feed frames to STT, and publish the synthesized TTS track. Implementing
 * it requires the LiveKit media SDK (`@livekit/rtc-node`, a native dependency),
 * a running LiveKit server, and a SIP/audio participant — none of which exist in
 * this environment, so it is intentionally NOT wired here. Swap it in for
 * `SimulatedTransport` once `LIVEKIT_URL` + the SDK are available.
 */
export function createLiveKitTransport(): AudioTransport {
  throw new Error(
    "LiveKit media transport is not wired in this build. To enable live audio: " +
      "install @livekit/rtc-node, run a LiveKit server, set LIVEKIT_URL, and implement " +
      "room audio I/O here (see docs/VOICE_PIPELINE.md §4.1).",
  );
}
