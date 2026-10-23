# Real phone calls — LiveKit + SIP (Phase 1 wired)

> **Status:** 2026-10-23 · The **media transport is wired** (`apps/voice-worker`):
> `livekit-transport.ts` + `livekit-runner.ts` + `audio.ts`, unit-tested, and the
> LiveKit SDK API surface is validated. What remains is **external, paid setup**
> (a LiveKit server + a SIP trunk + a phone number) and the **SIP dispatch** rule.

## The flow
```
Customer dials +998…
  → UZ carrier (PSTN)  → SIP trunk  → LiveKit SIP ingress  (creates a room)
  → voice-worker joins the room (livekit-runner → LiveKitTransport)
  → CallSession: STT → LLM → TTS  (same orchestrator as the browser Test Agent)
  → agent audio back out → caller hears it
```
Routing, transcripts, bookings and Google Calendar sync are unchanged — only the
live audio hop is new.

## What's built (this repo, free)
- **`audio.ts`** — int16 PCM ↔ WAV, linear resample, and an energy VAD that
  segments the continuous caller stream into utterances. Pure + unit-tested.
- **`LiveKitTransport`** (`livekit-transport.ts`) — implements the `AudioTransport`
  the `CallSession` already uses: VAD-segments caller audio into WAV turns for STT,
  streams TTS back as paced PCM frames, and triggers **barge-in** when the caller
  speaks over the agent. Unit-tested with a mock media I/O.
- **`runLiveKitCall`** (`livekit-runner.ts`) — joins a LiveKit room, mints the
  join token, bridges the caller track ↔ a published agent track to the transport,
  creates the Call over the internal channel, and runs one `CallSession`. The LiveKit
  SDK is **dynamically imported** (optionalDependencies), so the worker builds and
  runs without it until you configure LiveKit.

## What you provide (external)
1. **LiveKit** — [LiveKit Cloud](https://cloud.livekit.io) (has SIP) or self-hosted.
   Gives `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
2. **A SIP trunk + phone number** — from a carrier/VoIP provider. In Uzbekistan this
   usually means a **local licensed operator** (personal/int'l DIDs are restricted).
3. **Voice providers with credits** — Groq Whisper STT (free) + NeuronAI Uzbek TTS
   (paid). The phone path needs **wav or pcm16 TTS** (NeuronAI WAV works; OpenAI
   `opus` would need a decoder — not bundled).
4. **In-country hosting** — a VM in UZ for data residency (ZRU-547).

## Install the SDK
```bash
pnpm --filter @ovozai/voice-worker install   # pulls the optional @livekit/* deps
```

## Dev test — one live call
Set these and start the voice-worker; it will join the room and run a call:
```
LIVEKIT_URL=wss://<your>.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
LIVEKIT_DEV_ROOM=test-room
LIVEKIT_DEV_AGENT_ID=<an agent id>
# plus the usual VOICE_STT/LLM/TTS_* (Groq Whisper STT + NeuronAI TTS recommended)
```
Join `test-room` from the LiveKit playground (or a SIP call) and talk — the agent
answers through the real `CallSession`.

## Production SIP dispatch (remaining step)
Make inbound PSTN calls land on the agent:
1. In LiveKit, create an **inbound SIP trunk** for your number(s) and a **dispatch
   rule** that routes a call to a room (e.g. `call-<DID>`).
2. Dispatch the worker to that room. Either:
   - run one `runLiveKitCall({ roomName, toE164, … })` per room (a small dispatcher
     driven by LiveKit webhooks / the SIP participant metadata), **or**
   - adopt the LiveKit **Agents** framework for auto-dispatch.
   The dialed number (`toE164`) flows into `internal.createCall` → `PhoneNumber` →
   `Agent` routing you already have.
3. Map each number → agent on the **Phone numbers** dashboard page.

## Caveats
- **Uzbekistan:** telephony is licensed; partner with a local operator. Keep call
  PII in-country (ZRU-547).
- **Verification/scale:** none needed for a pilot; revisit at scale.
