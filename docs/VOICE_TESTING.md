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
| **Type-to-talk** conversation through the real loop | ✅ works now |
| **Real LLM responses** (Groq, free) | ✅ with a free Groq key (§5) |
| **Microphone speech-to-text** (browser Web Speech, Chrome) | ✅ free, in-browser |
| **Spoken replies** (browser Web Speech TTS) | ✅ free, in-browser |
| Call record + transcript in the dashboard | ✅ |
| **Server-side** STT/TTS for higher Uzbek quality | ⚠️ optional, needs a provider key (§5) |

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
3. **Speak**: click **🎤 Speak** (grant mic), say something in the selected
   language; the browser transcribes it and sends it. Keep **Speak responses** on
   to hear the agent reply aloud. (Chrome recommended; quality varies by language.)
4. Or **type-to-talk**: pick a language, type what the caller would say, **Send**.
   The agent reasons (with a real LLM + tools) and responds; both sides appear as
   **live captions**. Try an Uzbek question, a booking request
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

## 5. Real speech for free (Groq LLM + browser Web Speech)

A **real** conversation with **no paid keys** is wired today:

- **LLM → Groq** (free, no credit card): a real model answers (verified live).
- **STT + TTS → the browser's free Web Speech API** (Chrome): the mic transcribes
  and the agent's replies are spoken aloud — no server audio keys needed.

Setup (one free key):

1. Get a free Groq key — [console.groq.com/keys](https://console.groq.com/keys) (email, ~30s, no card).
2. In `.env` (the voice-worker reads it):
   ```
   VOICE_LLM_PROVIDER=openai
   VOICE_PROVIDER_BASE_URL=https://api.groq.com/openai/v1
   VOICE_PROVIDER_API_KEY=gsk_...
   VOICE_LLM_MODEL=qwen/qwen3.8-27b
   ```
   (Use **`qwen/qwen3.8-27b`** — good Uzbek; Groq's `gpt-oss-*` return empty content.)
3. Restart the voice-worker. On the Test page, click **🎤 Speak** (grant mic) or type,
   and keep **Speak responses** on to hear replies.

> The browser's STT/TTS Uzbek quality varies. For production-grade Uzbek, add a
> **server-side** STT/TTS provider (Google Chirp, Groq Whisper, Mohir.ai, ElevenLabs) —
> `createVoiceProviders` already supports per-modality providers (`VOICE_STT_PROVIDER` /
> `VOICE_TTS_PROVIDER` + models); implement/point the adapter and stream audio over the
> existing WS protocol. See [`MULTILINGUAL_EVALUATION.md`](./MULTILINGUAL_EVALUATION.md).

## 6. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| "Failed to fetch" creating the test session | API (3001) not up — see §1 dev-watch note. |
| "WebSocket connection error" | voice-worker gateway not running, or `VOICE_WS_PUBLIC_URL` / `VOICE_WS_PORT` mismatch. |
| "invalid or expired ticket" | Ticket older than `VOICE_TEST_SESSION_TTL_SECONDS` (default 120s) — click Start again; or `INTERNAL_HMAC_SECRET` differs between api and voice-worker. |
| Agent gives a generic answer | No knowledge base attached to the agent, or ingestion hasn't finished (jobs-worker running?). |
| Mic button does nothing | Browser denied permission; live STT also needs a real provider (§5). |
