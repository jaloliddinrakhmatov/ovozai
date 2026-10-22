# OvozAI — Voice Testing (Browser "Test Agent")

> **Status:** real-voice phase · **Last updated:** 2026-10-22
>
> How to have a real, two-way conversation with an OvozAI agent **in the browser**,
> through the live pipeline (STT → LLM → TTS), and how to verify it. This is the
> **browser Test-Agent** path; real phone (SIP) calling is [`SIP_INTEGRATION.md`](./SIP_INTEGRATION.md),
> and provider/accuracy work is [`MULTILINGUAL_EVALUATION.md`](./MULTILINGUAL_EVALUATION.md).

## What works today vs. what needs a provider key

| Piece | State |
| --- | --- |
| Browser → voice-worker **WebSocket gateway** | ✅ real, wired, tested |
| **Ticketed auth** (API-issued, HMAC-signed, short-lived) | ✅ |
| Real **CallSession** (greeting, tools, transcript, lifecycle, barge-in) | ✅ |
| **Type-to-talk** conversation (drives the real loop via the dev-bridge) | ✅ works now, no keys |
| Call record + transcript in the dashboard | ✅ |
| **Live microphone speech-to-text** | ⚠️ needs a real streaming STT provider (Google Chirp etc.) |
| **Natural TTS audio playback** in the browser | ⚠️ needs a real TTS provider |

The default providers are a **deterministic dev-bridge, not real speech**
(`packages/integrations/src/providers-local.ts`). Type-to-talk exercises the entire
pipeline end-to-end without keys; wiring a real STT/TTS provider turns the mic path
into a real spoken conversation.

## 1. Start the stack

Postgres + Redis must be running (Homebrew or Docker). Then:

```bash
pnpm dev            # web (3000) + api (3001) + jobs-worker + voice-worker
```

The voice-worker now starts the **Test-Agent gateway** on `ws://localhost:8787`
by default (set `VOICE_WS_PORT` to change it; the API advertises it to the browser
via `VOICE_WS_PUBLIC_URL`).

> If `pnpm dev` ever races on first boot (a shared library's type files briefly lag
> its code and the API compiles in the gap → "Failed to fetch" on the web), run the
> built output instead: `pnpm build` then, in separate shells,
> `node apps/api/dist/main.js`, `node apps/voice-worker/dist/main.js`,
> `pnpm --filter @ovozai/web dev`.

## 2. Open the dashboard & pick an agent

1. Open <http://localhost:3000>, register, and create an organization.
2. Go to **Agents**, create one (name + primary language), or use an existing agent.
   For knowledge-grounded answers, attach a **Knowledge** base with a document.

## 3. Test a real browser conversation

1. On **Agents**, click **Test** next to the agent (→ `/dashboard/agents/<id>/test`).
2. Click **Start test call**. The status badge goes **Live**, a call record is
   created (linked under the transcript), and the agent's **greeting** appears.
3. Click **Enable microphone** to grant mic permission (this proves the browser
   media flow; live transcription activates with a real STT provider — see §5).
4. Use **type-to-talk**: pick a language, type what the caller would say, **Send**.
   The agent transcribes → reasons (with tools) → responds, and both sides appear
   as **live captions**. Try an Uzbek question, a booking request
   ("Ertaga soat 15:00 ga yozilmoqchiman"), or "Rahmat, xayr" to end.
5. **Interrupt (barge-in)** stops the agent mid-response; **Hang up** ends the call.
6. Open **Calls** — the session is there with its full transcript.

## 4. Verify it yourself (no browser)

The repo ships automated proof:

- **Unit/integration:** `pnpm --filter @ovozai/voice-worker test` includes a test
  that drives the gateway end-to-end over a real WebSocket (ticket → greeting →
  knowledge answer → COMPLETED) and rejects tampered/expired tickets.
- **Live:** with the stack up, the gateway path is exercised against the real API
  (ticket issue → WS session → `Call` persisted COMPLETED with a transcript).

## 5. Turn on real speech (microphone + natural audio)

Live mic STT and natural TTS need a real provider (see
[`MULTILINGUAL_EVALUATION.md`](./MULTILINGUAL_EVALUATION.md) for the Uzbek
recommendation — Google Chirp STT + ElevenLabs/local TTS). Once chosen:

1. Set `VOICE_PROVIDER=openai` (or the new adapter) + the provider key(s) in `.env`
   for **both** the voice-worker and the jobs-worker.
2. Extend `VoiceProviderConfig` / `createVoiceProviders` with the per-modality
   adapter(s) (implementing the existing `SttProvider` / `TtsProvider` interfaces).
3. Stream mic PCM frames from the browser over the existing WS protocol (the
   message contract already reserves the audio + barge-in paths) to the new
   streaming STT, and play returned TTS audio frames back.

## 6. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| "Failed to fetch" creating the test session | API (3001) not up — see §1 dev-watch note. |
| "WebSocket connection error" | voice-worker gateway not running, or `VOICE_WS_PUBLIC_URL` / `VOICE_WS_PORT` mismatch. |
| "invalid or expired ticket" | Ticket older than `VOICE_TEST_SESSION_TTL_SECONDS` (default 120s) — click Start again; or `INTERNAL_HMAC_SECRET` differs between api and voice-worker. |
| Agent gives a generic answer | No knowledge base attached to the agent, or ingestion hasn't finished (jobs-worker running?). |
| Mic button does nothing | Browser denied permission; live STT also needs a real provider (§5). |
