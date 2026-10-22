# OvozAI — Multilingual Voice Provider Evaluation (Uzbek / Russian / English)

> **Status:** Research + framework · **Last updated:** 2026-10-22 · Owner: Voice team
>
> This document (1) recommends the real STT / LLM / TTS providers for OvozAI's
> target market and (2) defines a **reproducible evaluation framework** so provider
> choices are driven by measured numbers, not vibes. **No accuracy numbers are
> fabricated here** — the results tables are intentionally empty and filled only by
> running the harness against real audio with real provider keys (see §4–§5).

Read with [`VOICE_PIPELINE.md`](./VOICE_PIPELINE.md) (the loop) and
[`VOICE_TESTING.md`](./VOICE_TESTING.md) (how to run a real conversation).

---

## 1. The problem

Uzbek is a **low-resource, code-switching** language (Latin + Cyrillic scripts,
heavy Uzbek⇄Russian mixing in speech). The default dev providers in this repo are
a **deterministic dev-bridge, not real speech** (`packages/integrations/src/providers-local.ts`).
The current real adapter is **OpenAI-only** (`providers-openai.ts`), and OpenAI's
Uzbek STT/TTS quality is not competitive for a production receptionist. Independent
market signal confirms the gap: general voice-agent platforms (Vapi and similar)
do **not** support Uzbek conversational agents. So provider selection is a
first-class product decision, and **data residency** (Law No. ZRU-547,
[`COMPLIANCE.md §2`](./COMPLIANCE.md)) adds a constraint that favors in-country
providers where quality allows.

## 2. Provider landscape (researched 2026-10)

Qualitative, sourced; **not** a substitute for the measured eval in §4.

### Speech-to-Text (STT)

| Provider | Uzbek (uz-UZ) | Streaming | Notes / source |
| --- | --- | --- | --- |
| **Google Cloud STT (Chirp 2 / Chirp 3)** | ✅ **Official** `uz-UZ` | ✅ | Chirp 2/3 list `uz-UZ` with automatic punctuation, model adaptation, word-level confidence; built-in **WER Accuracy-Evaluation** tool. Strongest documented Uzbek support. (Google Cloud STT supported-languages docs.) |
| **ElevenLabs Scribe** | ✅ (advertised) | ⚠️ limited | Markets dedicated Uzbek STT; strong on noisy audio. |
| **OpenAI Whisper / `gpt-4o-transcribe`** | ⚠️ partial | ❌ (buffer) | Whisper covers Uzbek but quality is uneven for low-resource langs; robust to noise. Already wired (`OpenAiSttProvider`), non-streaming. |
| **Deepgram** | ⚠️ limited | ✅ | Excellent latency/streaming; Uzbek coverage weaker — evaluate before trusting. |
| **Mohir.ai / local UZ ASR** | ✅ UZ-specialized | varies | Uzbekistan-based; best for **in-country residency** + domain Uzbek. Verify API/SLA. |
| Azure / AWS | ⚠️/❌ | ✅ | Weaker on accented/low-resource speech in independent benchmarks. |

### Text-to-Speech (TTS)

| Provider | Uzbek voice | Notes |
| --- | --- | --- |
| **ElevenLabs** | ✅ multilingual | Most natural general TTS; 90+ languages incl. Uzbek; low-latency streaming (`eleven_flash`). |
| **Mohir.ai / NeuronAI (neuronai.uz) / CAMB.AI** | ✅ UZ-native | Uzbekistan-focused Uzbek TTS; **in-country residency** candidates; verify naturalness + streaming. |
| **Google Cloud TTS** | ⚠️ check `uz-UZ` | Pairs cleanly with Google STT if a usable Uzbek voice exists. |
| OpenAI TTS | ❌ weak UZ | Already wired; English-centric voices. |

### LLM (dialog + tool-calling)

| Provider | Uzbek fluency | Notes |
| --- | --- | --- |
| **OpenAI gpt-4o / gpt-4o-mini** | ✅ good | Already wired (`OpenAiLlmProvider`, streaming + tools). Strong UZ/RU/EN + reliable tool-calling. Sensible default. |
| **Google Gemini** | ✅ good | Top ASR+reasoning in benchmarks; viable if standardizing on Google. |

## 3. Recommended architecture

**Default production stack (pending measured confirmation in §4):**

- **STT → Google Cloud STT, Chirp 3 (`uz-UZ` / `ru-RU` / `en-US`), streaming.**
  Best-documented Uzbek support, streaming for low latency, and a native WER tool
  to seed our baselines. Keep `createFallbackStt` (Phase 5) with **Whisper** as the
  fallback (noise robustness) so a single-provider outage degrades gracefully.
- **TTS → ElevenLabs** (naturalness, streaming) **for launch**, with **a local UZ
  provider (Mohir.ai / NeuronAI)** evaluated in parallel as the **residency-preferred**
  option — switch to it for in-country deployment if naturalness is acceptable.
- **LLM → OpenAI `gpt-4o-mini`** (keep the wired adapter) for dialog + tool-calling;
  re-evaluate Gemini if we consolidate on Google.
- **Data residency:** for production in Uzbekistan, prefer in-country STT/TTS
  (Mohir.ai-class) once they pass §4; otherwise document the cross-border processing
  and obtain consent per ZRU-547.

**Why not just OpenAI for everything:** Uzbek STT/TTS quality. The code is
provider-agnostic (`createVoiceProviders`), so each modality is swappable
independently — we are **not** locked in.

**Integration impact:** `VoiceProviderConfig` currently models a single
`provider: "local" | "openai"`. To adopt the above, extend it to **per-modality
providers** (e.g. `sttProvider`, `ttsProvider`, `llmProvider`) and add `google` /
`elevenlabs` / `mohir` adapters implementing the existing `SttProvider` /
`TtsProvider` / `LlmProvider` interfaces. **Streaming STT** also means the WebSocket
transport should forward **interim** transcripts (partials) for live captions.

## 4. Evaluation framework (reproducible)

Goal: a repeatable harness that scores each candidate stack on real audio so
decisions are evidence-based. **Do not fabricate scores or claim synthetic-text
tests prove real-audio accuracy.**

### Metrics

| Metric | What | How |
| --- | --- | --- |
| **WER** | word error rate (STT) | `computeWer` (already in `@ovozai/integrations`) vs a **verified reference transcript**. |
| **CER** | character error rate (STT) | **To add** — `computeCer` (Levenshtein over characters); matters for Uzbek morphology/scripts. |
| **Latency** | end-of-speech → start-of-audio | instrument the WS transport; report p50/p95 per stage (STT, LLM, TTS). |
| **Language detection** | detected vs true language | per-utterance accuracy over the labeled set. |
| **Booking-intent recognition** | did the model call `book_appointment` when it should | labeled intent set; precision/recall. |
| **Tool-calling accuracy** | correct tool + well-formed args | scripted scenarios → assert tool + arg schema. |
| **Interruption (barge-in)** | TTS stops within N ms of caller speech | measured at the media layer. |

### Dataset (to build — see §5)

A small, **labeled** Uzbek/Russian/English corpus with **human-verified reference
transcripts**: greetings, names, dates/times, phone numbers, prices, and
appointment-booking dialogs, including UZ⇄RU code-switching and both Latin/Cyrillic.
Store under `evaluation/corpus/` with a manifest (`audio`, `reference`, `language`,
`intent`). **Never** auto-generate references and treat them as ground truth.

### Harness

`evaluation/run-eval.mjs` (to add): for each candidate stack and each clip, run STT
→ compute WER/CER + latency; run the labeled dialogs → score intent + tool-calling;
emit a results table per language + provider. Results are recorded back here in §6
with the date, provider versions, and dataset hash.

## 5. Status & what's blocked

| Item | State |
| --- | --- |
| Provider research + recommendation | ✅ this document |
| **Per-modality provider config** (`createVoiceProviders` + env) | ✅ built |
| **Free real LLM via Groq** (`qwen/qwen3.8-27b`, OpenAI-compatible) | ✅ **wired + live-verified** (browser Test Agent answered a real question through Groq) |
| Browser STT + TTS (free Web Speech API, Chrome) | ✅ in the Test-Agent page |
| Google Chirp / ElevenLabs / Mohir server-side adapters | ⬚ to build (needs the chosen provider **API keys**) |
| `computeCer` + metric additions | ◐ small, buildable now |
| Labeled UZ/RU/EN corpus with verified references | ⬚ needs recording + human verification |
| Real measured WER/CER/latency numbers | ⛔ **blocked** on server STT keys + the corpus — **not** fabricated here |

> **Free path (implemented):** real LLM via **Groq** (free, no card) + **browser Web Speech API**
> for STT/TTS. Set `VOICE_LLM_PROVIDER=openai`, `VOICE_PROVIDER_BASE_URL=https://api.groq.com/openai/v1`,
> `VOICE_PROVIDER_API_KEY=gsk_…`, `VOICE_LLM_MODEL=qwen/qwen3.8-27b`. `gpt-oss-*` on Groq return
> empty content (reasoning models) — use Qwen. See `docs/VOICE_TESTING.md`.

**Needed from the business:** chosen provider accounts + API keys (Google Cloud,
ElevenLabs, and/or a local UZ provider), and a few native speakers to record and
verify the reference corpus.

## 6. Results

_Empty until the harness runs against real audio with real keys. Each run appended
with date, provider + model versions, dataset hash, and the metric tables above._
