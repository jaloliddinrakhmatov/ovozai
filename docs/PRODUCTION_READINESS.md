# OvozAI — Production Readiness Assessment

> **Date:** 2026-10-22 · **Auditor:** architecture/QA pass · **Verdict:** **NOT production-ready**
> for a real phone pilot yet — strong application core, but deployment infrastructure, real
> telephony, data residency, and backups are missing. Detail below. This audit is grounded in
> **actually running the suite and inspecting the repo**, not prior development reports.

See also [`DEPLOYMENT_GUIDE.md`](./DEPLOYMENT_GUIDE.md) and
[`PILOT_LAUNCH_PLAN.md`](./PILOT_LAUNCH_PLAN.md).

---

## 1. Verification performed (this audit)

### Automated (re-run 2026-10-22, all green)
| Check | Result |
| --- | --- |
| `pnpm build` | ✅ 8/8 |
| `pnpm typecheck` | ✅ 12/12 |
| `pnpm lint` | ✅ 12/12 |
| `pnpm test` (unit) | ✅ **133** (contracts 4, jobs-worker 12, api 42, web 59, voice-worker 16) |
| `pnpm --filter @ovozai/api test:e2e` | ✅ 7 (boots the app over HTTP) |

### Live integration (against real Postgres 17 + Redis via Homebrew, this environment)
| Smoke | Result |
| --- | --- |
| Phase 7 hardening (RLS cross-tenant block, retention, erasure, /metrics, logs) | ✅ 38 checks |
| Voice gateway (ticket → WS → CallSession → real LLM → Call persisted) | ✅ |
| Real LLM (Groq `qwen`, NeuronAI `gemma`) answering through the browser path | ✅ (computed 2+2=4 — a canned engine can't) |
| NeuronAI native Uzbek TTS (WAV streamed to the browser) | ✅ (when credits available) |
| Graceful TTS-failure fallback (provider 402 → browser speech, call survives) | ✅ |

### Real mic / telephone (NOT automatable here — tested manually in-browser)
- **Browser microphone (Chrome Web Speech):** manually tested by the operator in UZ/RU/EN; it
  works, but **free-browser Uzbek recognition quality is inconsistent** (not a server STT).
- **Real phone (SIP) call:** **not testable** — no LiveKit server / SIP trunk / UZ number wired.

> **Automated ≠ real-world.** The unit/e2e/live smokes exercise the *pipeline and control plane*
> with real Postgres/Redis and real LLM/TTS HTTP. They do **not** prove real PSTN audio quality,
> real SIP interop, or at-scale concurrency. Those require the infra in §4 and are classified
> BLOCKED below.

---

## 2. Feature classification

Legend: 🟢 VERIFIED WITH REAL SERVICES · 🟡 VERIFIED WITH MOCKS ONLY · 🔵 IMPLEMENTED BUT NOT
VERIFIED · ⛔ BLOCKED (needs external infra/credentials) · ⚪ NOT IMPLEMENTED

### Platform / control plane
| Feature | Status | Notes |
| --- | --- | --- |
| Auth (register/login/refresh/logout/switch-org), argon2id, rotating refresh | 🟢 | Phase-2 live smoke + e2e |
| RBAC (OWNER/ADMIN/MEMBER/VIEWER), deny-by-default | 🟢 | |
| Multi-tenant isolation (Prisma extension) | 🟢 | Primary guard; verified by tests |
| **PostgreSQL RLS** (defense-in-depth) | 🟢 | Cross-tenant block verified at the DB with the app guard bypassed |
| Organizations / memberships / invitations / API keys / audit log | 🟢 | |
| AI agents + versioning | 🟢 | |
| Knowledge base (ingest → chunk → embed → retrieve), UZ/RU/EN | 🟢 | App-side cosine; **pgvector is a future scale upgrade** |
| Customers / appointments CRUD (dashboard/API) | 🟢 | |
| Retention policy + right-to-erasure (audited) + sweep job | 🟢 | Phase-7 live smoke |
| Observability: `/metrics` (Prometheus), structured PII-redacted logs | 🟢 | No tracing backend wired (⚪ OTel) |
| Webhooks (HMAC-SHA256, async delivery) | 🟢 | |
| Usage metering (CALL_MINUTES/LLM_TOKENS) + rollups | 🟢 | **Analytics are real data**, not fabricated |

### Voice
| Feature | Status | Notes |
| --- | --- | --- |
| STT→LLM→TTS orchestration (`CallSession`), barge-in, tools, transcript | 🟢 | Verified via simulated + browser gateway |
| Browser **Test Agent** (WebSocket gateway, ticketed auth) | 🟢 | |
| Real LLM — Groq `qwen` / NeuronAI `gemma` (OpenAI-compatible) | 🟢 | Per-modality providers |
| Native **Uzbek TTS** (NeuronAI `kamron`), WAV streamed to browser | 🟢 | Usage-billed; graceful fallback on failure |
| Browser microphone STT (free Web Speech, Chrome) | 🟡 | Works; Uzbek accuracy inconsistent — not server-grade |
| **Server-side STT** for mic accuracy (NeuronAI `/stt`, Google Chirp) | ⚪ | Not wired; per-modality slot exists |
| OpenAI STT/TTS adapters | 🔵 | Real HTTP; not credit-verified here |
| WER measurement harness + Uzbek baseline | 🟢 | CER ⚪ not implemented |
| **Real inbound phone (SIP) calls** | ⛔ | `livekit-transport.ts` is a stub; needs LiveKit server + `@livekit/rtc-node` + SIP trunk + UZ numbers |
| Human transfer (`transfer_call`) | 🟡 | Records handoff → `TRANSFERRED`; **no real SIP bridge** |
| Recording storage | 🟡 | Local-fs default; **real S3 adapter throws (boundary)** |

### Appointment booking "through the AI" (task #4 — verified precisely)
| Capability | Status | Notes |
| --- | --- | --- |
| Book via `book_appointment` voice tool | 🟡 | **Create-only** — persists an appointment, but **no availability/slot check, no conflict/duplicate prevention** |
| Reschedule / cancel via voice | ⚪ | API endpoints exist; **not exposed as agent tools** |
| Reliable tool-calling by the LLM | 🔵 | Groq `qwen` calls tools; NeuronAI `gemma` is less reliable |
| Calendar sync of a booking | 🟡 | Mock `CalendarProvider`; real Google not wired |

### Billing & integrations
| Feature | Status | Notes |
| --- | --- | --- |
| Plans / subscriptions / plan-limit enforcement | 🟡 | Logic real + tested; `PaymentProvider` is **mock** (no Stripe/local PSP) |
| Usage rollups reconcilable against raw records | 🟢 | |
| Calendar / CRM integrations | 🟡 | Mock providers |
| Notifications (in-app log) | 🟢 | Email/SMS delivery 🟡 mock |

### Security / compliance / ops
| Area | Status | Notes |
| --- | --- | --- |
| RLS + tenant isolation + RBAC + audit log | 🟢 | |
| Secrets never committed (`.env` gitignored) | 🟢 | Field-level encryption / KMS at rest ⚪ |
| Error handling (RFC 9457 problem+json), graceful degradation | 🟢 | |
| PII redaction in logs | 🟢 | |
| **Uzbekistan data residency** (ZRU-547) | ⛔ | Needs in-country hosting + operator registration |
| **Backups + tested restore** | ⚪ | No backup config anywhere in the repo |
| External penetration test / SOC2 evidence | ⛔ | Needs auditors + an operated deployment |

### Deployment / infrastructure
| Item | Status | Notes |
| --- | --- | --- |
| Local dev stack (docker-compose: PG16 + Redis7) | 🟢 | Dev only; MinIO + LiveKit are **commented out** |
| **Container images (Dockerfiles) for the 4 apps** | ⚪ | **None exist** |
| **CI/CD pipeline** | ⚪ | **No `.github/workflows`** (roadmap claimed CI; it is not in the repo) |
| **IaC / k8s / Helm** | ⚪ | None |
| Production DB / Redis / object store / TLS / domain | ⛔ | Must be provisioned |
| Monitoring/alerting stack (Prometheus/Grafana + log aggregation) | ⛔ | `/metrics` + JSON logs exist; nothing scrapes/stores them |

---

## 3. Critical blockers (must clear before a real phone pilot)

1. **No deployment path.** No Dockerfiles, no CI, no IaC, no hosting. The app runs only on a dev
   machine today. → see [`DEPLOYMENT_GUIDE.md`](./DEPLOYMENT_GUIDE.md).
2. **Real phone calls don't work.** A "voice receptionist" pilot needs inbound PSTN; LiveKit/SIP
   is a stub. Either wire LiveKit + a UZ SIP trunk, or run a **browser-only** pilot (narrower).
3. **Data residency + legal (ZRU-547).** Customer call PII must be stored in Uzbekistan and the
   operator registered. This is a legal gate, not just infra.
4. **No backups / restore.** Non-negotiable before holding real customer data.
5. **Server-side Uzbek STT** for mic accuracy (browser STT is too inconsistent for production).
6. **Booking is create-only** — no availability/conflict checks and no reschedule/cancel via
   voice. A receptionist that double-books or can't cancel is a product risk.
7. **Payments are mocked** — fine for a *free* pilot; required before charging.

---

## 4. Overall readiness

| Dimension | Score (1–5) | Why |
| --- | --- | --- |
| Application correctness | **4** | Core verified, tests green; booking robustness gaps |
| Security & tenancy | **4** | RLS + RBAC + audit strong; KMS/backups/residency open |
| Voice (browser) | **3.5** | Real LLM + native TTS work; mic STT quality + verbosity/cost need tuning |
| Voice (real phone/SIP) | **1** | Not wired |
| Deployability | **1** | No containers/CI/IaC/hosting |
| Observability | **3** | Metrics + logs exist; nothing collects them |
| Compliance/legal | **2** | Controls built; residency + registration + audit pending |

**Verdict:** The **software** is in good shape for a **browser-based soft pilot**; it is **not
ready for a real-phone, customer-PII production pilot** until blockers 1–5 are cleared. Realistic
path: a **browser/WhatsApp-style soft pilot in-country first**, then add SIP.

---

## 5. What is genuinely done well
- Clean modular monolith + separable workers; provider-agnostic voice (swap STT/LLM/TTS per
  modality without code changes).
- Real defense-in-depth security (app-layer tenancy **+** DB RLS), verified.
- Honest boundaries throughout — no fake "it works" where infra is absent.
- A real, free, working Uzbek voice loop in the browser (NeuronAI LLM + TTS), with graceful
  degradation.
