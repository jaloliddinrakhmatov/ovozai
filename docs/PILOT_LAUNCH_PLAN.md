# OvozAI — Pilot Launch Plan (first 2–3 businesses, Uzbekistan)

> **Status:** 2026-10-22 · Companion to [`PRODUCTION_READINESS.md`](./PRODUCTION_READINESS.md) and
> [`DEPLOYMENT_GUIDE.md`](./DEPLOYMENT_GUIDE.md). Nothing here is deployed, provisioned, or
> contracted — it is a plan awaiting your go-ahead and the manual steps in §5.

## 1. Recommended pilot shape

Two options — **start with A**, graduate to B once it's stable:

**A. Browser / soft pilot (no real phone, fastest, lowest risk).** The business receptionist (or a
test phone browser / a simple web widget) talks to the agent in the browser. Validates the agent,
Uzbek quality, booking, and the dashboard with **real businesses and real data** — without SIP,
LiveKit, or carrier contracts. Clears most blockers except residency + backups.

**B. Real-phone pilot (one UZ number per business).** Inbound PSTN → LiveKit SIP → agent. Needs
the telephony stack (blocker #2) and is the true product. Do this only after A is solid.

## 2. Prerequisites by pilot type

| Prerequisite | Soft pilot (A) | Phone pilot (B) |
| --- | --- | --- |
| In-country hosting (VM + Postgres + Redis + S3) | ✅ required | ✅ required |
| Backups + tested restore | ✅ | ✅ |
| TLS + domain | ✅ | ✅ |
| Server-side Uzbek **STT** (NeuronAI `/stt` or Google Chirp) | ▲ recommended | ✅ required |
| NeuronAI **TTS** credits (native Uzbek voice) | ✅ | ✅ |
| LLM (Groq free, or NeuronAI) | ✅ | ✅ |
| LiveKit server + `@livekit/rtc-node` wired | — | ✅ required |
| UZ SIP trunk + phone number(s) | — | ✅ required |
| ZRU-547: in-country PII + operator registration | ✅ (handling real PII) | ✅ |
| Payments (only if charging) | optional (run free) | optional |

## 3. Costs — rough monthly estimate

**Assumptions:** 2–3 small businesses; ~**500 calls/month** total; avg call ~**3 min**, ~**6 agent
turns**, ~**120 Uzbek chars spoken per turn**; single small VM; usage-billed voice. These are
planning figures to validate against real quotes — **not committed prices**.

| Line item | Assumption | Est. / month |
| --- | --- | --- |
| VM (UZ region, 2–4 vCPU) running 4 apps + MinIO | single host | **$30–80** |
| Managed Postgres (or same-host + backups) | small | **$15–50** |
| Managed Redis (or same-host) | small | **$10–30** |
| Object storage (recordings) | low volume | **$5–20** |
| **LLM** | Groq free tier → ~$0; or NeuronAI gemma (1.5/6 credits per 1K tok) | **$0–20** |
| **TTS** (NeuronAI, 0.3 credits/char) | ~500 calls × 6 turns × 120 chars ≈ 360K chars ≈ 108K credits | **see note** |
| **STT** (NeuronAI 1 credit/sec, if used) | ~500 × 3 min × 60s ≈ 90K credits | **see note** |
| LiveKit (phone pilot only) | self-host on the VM, or Cloud (usage) | **$0–40** |
| SIP trunk + UZ numbers (phone pilot only) | per number + per-minute | **carrier quote** |
| **Soft-pilot total (excl. voice credits)** | | **~$60–180/mo** |

> **Voice-credit note:** NeuronAI sells credits (min top-up 10,000; 4,000 free on signup). At the
> volumes above, TTS is the dominant cost — **trim agent verbosity (1–2 sentence replies) to cut it
> ~5–10×**. Get exact UZS pricing from NeuronAI + the SIP carrier before committing; telephony
> per-minute is the biggest variable for pilot B.

## 4. Phased timeline

- **Phase 0 — Hardening & deploy (prep).** Clear blockers 1,3,4,5 from PRODUCTION_READINESS:
  Dockerfiles + CI, in-country infra, backups, server-side STT. Trim agent verbosity. Deploy to
  staging; run the full gate + voice smoke there.
- **Phase 1 — Soft pilot, 1 friendly business.** Real agent + knowledge base + real data in the
  browser. Watch WER, booking correctness, latency (`/metrics`), notifications. Daily check-ins.
- **Phase 2 — 2–3 businesses, soft.** Add booking availability/conflict + reschedule/cancel as
  voice tools (product gap). Tune Uzbek prompts/voices per business. Collect a labeled corpus for
  the WER/CER eval (`MULTILINGUAL_EVALUATION.md`).
- **Phase 3 — Phone pilot.** Stand up LiveKit + SIP + one UZ number; verify a real inbound call;
  move one business to the phone. Expand only after a clean week.

**Go/no-go to each next phase:** no cross-tenant leak; RLS enforced; backups restore-tested; p95
voice latency acceptable; booking never double-books; recording consent honored; cost per call
within target.

## 5. Exact manual steps you must complete

1. **Decide pilot type** (A soft first — recommended).
2. **Provision in-country infra** (VM + Postgres + Redis + S3 in an Uzbekistan region) and a domain.
3. **Open provider accounts + fund them:** NeuronAI (top up credits), Groq (free key) — put keys in
   the deployment secret manager, **not chat**.
4. **Legal:** confirm ZRU-547 obligations (in-country PII, operator registration) with counsel.
5. **(Phone pilot)** contract a **UZ SIP trunk + number(s)** and a LiveKit host.
6. **Recruit 1–3 friendly businesses**; gather their hours/services/FAQ for the knowledge base.
7. **Approve the engineering work** in Phase 0 (Dockerfiles/CI/backups/STT/booking) — I will not
   deploy, purchase, or contact businesses without your go-ahead.

## 6. What I can do next (no external spend, awaiting your approval)
- Add **Dockerfiles + a production `docker-compose` + a CI workflow** (containerize the 4 apps).
- Wire a **server-side Uzbek STT** adapter (NeuronAI `/stt`) for real mic accuracy.
- Add **booking availability/conflict checks + reschedule/cancel voice tools** (closes the receptionist gap).
- **Trim agent verbosity** (cheaper, snappier replies).
- Draft the `SIP_INTEGRATION.md` runbook for the phone phase.

Tell me which to start, and I'll implement + verify in small, committed steps.
