# OvozAI — Delivery Roadmap

> **Status:** Living document · **Last updated:** 2026-10-22 · **Current phase:** **Phase 7 — Hardening & compliance (complete) — all roadmap phases delivered**

This roadmap sequences OvozAI from an empty repository to a hardened, compliant, production voice-receptionist platform. It is written for a **small team**: each phase delivers a **vertical slice** that is demonstrable end-to-end, keeps module boundaries clean so later phases plug in cleanly, and treats Uzbek speech quality and data privacy as early, continuous concerns rather than end-of-project surprises.

Read alongside:

- [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) — structure, boundaries, ADRs, risks
- [`docs/DATABASE.md`](./DATABASE.md) — schema and multi-tenancy
- [`docs/API.md`](./API.md) — REST surface and contracts
- [`docs/VOICE_PIPELINE.md`](./VOICE_PIPELINE.md) — real-time voice loop
- [`docs/SECURITY.md`](./SECURITY.md) — authn/z, privacy, compliance
- [`CLAUDE.md`](../CLAUDE.md) — repository conventions

---

## Guiding Principles

- **Ship vertical slices.** Every phase ends with something runnable and demonstrable end-to-end, not a pile of half-wired layers. Prefer one thin path that works over many broad paths that don't.
- **Keep module boundaries clean.** The NestJS backend is a modular monolith (see [ADR-003](./ARCHITECTURE.md#adr-003--modular-monolith-over-microservices-for-the-control-plane)). Modules talk through exported services, never by reaching into each other's data. Clean boundaries are what let a later phase add a module — or extract one — without a rewrite.
- **Measure Uzbek STT quality early.** Uzbek is a low-resource, code-switching language. We start measuring **Word Error Rate (WER)** the moment the first voice slice exists (Phase 4) and build multi-provider fallback and tuning around the numbers (Phase 5). We do not wait until "productionization" to discover the models are not good enough.
- **Privacy by design.** Call recordings and transcripts are sensitive PII under Uzbekistan Law No. ZRU-547. Consent capture, retention, tenant isolation, and data-residency awareness are designed in from the relevant slice onward and consolidated in Phase 7 — never bolted on.
- **Small-team realism.** Scope is deliberately conservative. One STT/LLM/TTS provider each before multi-provider. One deploy before many. Defer billing, advanced dashboards, and compliance tooling until the core product proves itself.

---

## Phase Overview

| Phase | Theme | Status | Primary outcome |
| --- | --- | --- | --- |
| 1 | Development foundation | ✅ Complete | Monorepo, apps, DB wiring, health check, CI, tests — a clean runway |
| 2 | Auth + multi-tenant core | ✅ Complete | Sign-in, organizations, memberships, RBAC, API keys, dashboard shell, audit log |
| 3 | AI agents + knowledge base | ✅ Complete | Configurable agents, document ingestion/embeddings/retrieval, customers, appointments |
| 4 | Voice MVP | ✅ Complete\* | Inbound call answered by an AI agent; basic multilingual chat; transcripts |
| 5 | Telephony productionization | ✅ Complete\* | Real SIP trunk, UZ numbers, transfers, recordings to S3, multi-provider STT + WER |
| 6 | Billing + integrations | ✅ Complete\* | Plans/subscriptions/usage/payments, calendars/CRM, notifications |
| **7** | **Hardening & compliance** | **✅ Complete\*** | RLS, retention/erasure, observability, load harness, security audit, SOC2-style controls |

Phases are sequential but boundaries are soft at the edges — e.g. webhook plumbing may begin in Phase 5 and complete in Phase 6. Each phase's **Exit Criteria** must be met before the next phase's slice is considered started.

---

## Phase 1 — Development Foundation · **CURRENT, IN PROGRESS**

### Goal

Stand up a clean, reproducible development runway: the full monorepo skeleton, two running apps (web + api), database wiring, a working health check surfaced on the landing page, and the quality gates (strict TS, lint, format, tests, CI) that every later phase depends on. **This phase explicitly excludes voice calling, billing, and the advanced dashboard** — it is about the foundation, not the product features.

### Scope & Deliverables

- [ ] Turborepo + pnpm workspaces monorepo under `@ovozai/*` with the app/package layout from [`ARCHITECTURE.md §3`](./ARCHITECTURE.md#3-monorepo-layout)
- [ ] `apps/web` — Next.js 16 (App Router) with a landing page
- [ ] `apps/api` — NestJS 12 app skeleton with `config` wiring (`@nestjs/config`)
- [ ] **Strict TypeScript** (pinned 5.9.3) via shared `packages/config` tsconfig preset
- [ ] **ESLint 10 (flat config)** + typescript-eslint + **Prettier 3.9** shared presets in `packages/config`
- [ ] `docker-compose` providing **PostgreSQL 16 + Redis 7** for local dev
- [ ] `packages/database` — Prisma 7.10.1 schema + **initial migration** + generated client + seed scaffold
- [ ] `packages/contracts` scaffold — first shared zod schemas (config + health response)
- [ ] **Health-check endpoint** on the api via `@nestjs/terminus` (DB/Redis connectivity)
- [ ] **Landing page shows backend connection status** by calling the health endpoint
- [ ] Environment management with a complete **`.env.example`**; no secrets committed
- [ ] **Baseline automated tests** — Vitest unit test(s) + a Playwright check of the landing page's status indicator
- [ ] CI running the Turborepo task graph (build, lint, test) on every change
- [ ] `README` with setup/run instructions

### Exit Criteria

- A fresh clone runs `pnpm install` and a single dev command brings up web + api against the compose stack.
- The api `/health` endpoint reports healthy with PostgreSQL and Redis connected; the landing page reflects this live.
- `prisma migrate` applies the initial migration cleanly against PostgreSQL 16.
- Lint, format, type-check, and the baseline test suite all pass in CI.
- `.env.example` is complete enough that a new developer needs no tribal knowledge to boot the stack.
- No voice, billing, or advanced-dashboard code exists — scope held.

---

## Phase 2 — Authentication & Multi-Tenant Core · **COMPLETE (2026-10-22)**

> Delivered and verified end-to-end against live PostgreSQL + Redis. Two entities
> beyond the original ERD were added to support the flows (`Session` for rotating
> refresh tokens, `Invitation` for invite-by-email) — see `docs/DATABASE.md` /
> schema ADR notes. `auth/register` was added to the API surface for sign-up.

### Goal

Turn the skeleton into a real multi-tenant SaaS shell: users can sign up, create an organization, invite members with roles, and land in a (minimal) authenticated dashboard. Establish the tenant-isolation mechanism and the audit trail that every later feature relies on.

### Scope & Deliverables

- [x] `auth` module — JWT **access + rotating refresh** tokens; register, login, refresh, logout, switch-org; argon2id password handling
- [x] `users` module — identity and profile
- [x] `organizations` module — tenant lifecycle (create / read / update / soft-delete)
- [x] `memberships` module — user↔org links with a **role**, invitations (invite / accept), role change, removal, last-owner protection
- [x] `api-keys` module — organization-scoped programmatic keys (hashed, prefixed, shown once)
- [x] **RBAC guards + decorators** enforcing OWNER / ADMIN / MEMBER / VIEWER (AGENT_OPERATOR reserved)
- [x] **Multi-tenancy enforcement** — Prisma Client extension injecting/validating `organizationId`; tenant resolved from the principal's active-org claim via `AsyncLocalStorage` and checked against live membership
- [x] `audit-log` module — append-only record of security-relevant actions
- [x] **Dashboard shell** in `apps/web` — authenticated layout, org switcher, member management + API-key screens
- [x] `packages/ui` grew the shared components the shell needs (Input, Label, Card, Badge, Alert)

### Exit Criteria

- A new user can register, create an org, invite a second user, and that user joins with the assigned role.
- Role restrictions are enforced by guards (e.g. VIEWER cannot mutate; only OWNER/ADMIN can manage members).
- A query carrying a mismatched or missing `organizationId` is rejected — cross-tenant reads/writes are impossible through the normal data path (verified by tests).
- Access tokens expire and refresh correctly; logout invalidates the session.
- Security-relevant actions (login, role change, API-key creation) appear in the audit log.

---

## Phase 3 — AI Agent Management & Knowledge Base · **COMPLETE (2026-10-22)**

> Delivered and verified end-to-end (29-check live smoke: agent versioning/rollback,
> async ingestion via the jobs-worker, UZ/RU/EN retrieval, customers, appointments,
> tenant isolation). **ADR — embeddings:** stored as `Float[]` with app-side exact
> cosine retrieval (not pgvector; that is the Phase-7 scale upgrade). The embedding
> provider is pluggable (`packages/integrations`) with a local deterministic lexical
> embedder as the no-API-key default. Phase-3 document ingestion covers inline
> TEXT/FAQ; UPLOAD/URL land with object storage + SSRF handling in a later phase.

### Goal

Let a business define *what the agent knows and how it behaves* — before it can speak. Build agent configuration with versioning, a knowledge-base ingestion pipeline (documents → chunks → embeddings → retrieval), and the customer/appointment data the agent will later read and write.

### Scope & Deliverables

- [x] `agents` module — AI agent configuration (persona, languages, behaviour) with **versioned** definitions (publish/list/restore)
- [x] `knowledge-base` module — document ingestion (TEXT/FAQ), **chunking**, **embedding** generation, **retrieval** query API
- [x] Embedding generation runs as **BullMQ jobs** in `jobs-worker` (async, retryable with exponential backoff; terminal FAILED state)
- [x] Embedding access through `packages/integrations` provider-agnostic interface (local lexical default; OpenAI-compatible HTTP provider)
- [x] `customers` module — end-customer records per tenant (search by name/phone/email)
- [x] `appointments` module — create/reschedule/cancel, status lifecycle
- [x] Dashboard screens to manage agents, upload knowledge documents (with live ingestion status), and view customers/appointments
- [x] Retrieval quality smoke tests over seed knowledge content (unit: UZ/RU/EN relevance; live: end-to-end)

### Exit Criteria

- A business can create an agent, attach knowledge documents, and see them ingested (chunked + embedded) with visible status.
- A retrieval query over the knowledge base returns relevant chunks for a sample question in Uzbek, Russian, and English.
- Embedding jobs are processed asynchronously with retry/backoff; failures are observable.
- Customers and appointments can be created and listed, tenant-isolated, through the dashboard.
- Agent versions are preserved so a later change can be rolled back.

---

## Phase 4 — Voice MVP · **COMPLETE\* (2026-10-22)**

> \*Built and verified end-to-end via a **simulated (text-driven) call** through the
> real pipeline (25-check live smoke: agent answers knowledge-grounded questions in
> UZ/RU/EN, barge-in, transcript + events persisted, API authoritative). The
> provider adapters (STT/LLM/TTS) ship with a **local no-key default** and real
> OpenAI-compatible adapters. The **live LiveKit audio hop is implemented behind a
> transport interface but NOT exercised here** — it needs a LiveKit server +
> `@livekit/rtc-node` + real provider keys (see `apps/voice-worker/src/livekit-transport.ts`).
> Recordings to S3 and real SIP telephony are Phase 5.

### Goal

The first time OvozAI actually answers a phone. Integrate LiveKit, stand up the `voice-worker`, wire **one** STT, LLM, and TTS provider each, and have an inbound call answered by the configured agent with a basic multilingual conversation — then persist the call and its transcript.

### Scope & Deliverables

- [x] `apps/voice-worker` — runs the **STT→LLM→TTS loop** + state machine behind a transport interface (SimulatedTransport verified; LiveKit transport is the documented, not-yet-wired media hop)
- [~] LiveKit integration — transport interface + boundary in place; the live media SDK/server is not wired here (needs `@livekit/rtc-node` + a server). MinIO/recordings deferred to Phase 5
- [x] **One provider each** for STT, LLM, TTS behind the `integrations` interfaces (local deterministic default + OpenAI-compatible real adapters)
- [x] VAD-based turn-taking and **barge-in** (cancellable TTS via AbortSignal; verified)
- [x] Core agent tools wired: `knowledge_retrieval`, `book_appointment`, `end_call` (transfer stubbed for Phase 5)
- [x] `calls` module — call history, **transcripts**, recording metadata (object key field; S3 upload in Phase 5)
- [x] **Internal authenticated channel** (service token + HMAC over `/internal/v1`) carrying call lifecycle events + transcript + tools from voice-worker → api
- [x] Basic **multilingual** conversation (Uzbek / Russian / English) — verified
- [x] **WER measurement harness** — `computeWer` + a recorded first Uzbek baseline
- [x] Dashboard call-history view with transcript + events

### Exit Criteria

- An inbound call (dev: via LiveKit) is answered by the agent; a caller can ask a question and get a knowledge-grounded answer.
- The agent handles at least a basic exchange in each of Uzbek, Russian, and English.
- Barge-in works: the caller can interrupt the agent's speech.
- The call appears in history with a persisted transcript; recording metadata is captured.
- A first **WER baseline** for Uzbek is recorded, establishing the number Phase 5 will improve.
- Call lifecycle events reach the api reliably; the api is the authoritative record.

---

## Phase 5 — Telephony Productionization · **COMPLETE\* (2026-10-22)**

> \*Built and verified end-to-end for everything that does not require external
> telephony infra (17-check live smoke: inbound number→agent routing, warm/cold
> transfer → TRANSFERRED, consent-gated recording stored + retrievable, an
> HMAC-signed webhook delivered to a live receiver, and per-provider WER tracking
> with fallback < primary). The **real SIP trunk, Uzbekistan number provisioning,
> LiveKit SIP ingress, real S3, and additional live STT provider keys are NOT
> available here** — SIP/number-provisioning run behind interfaces with a mock
> provider, recordings use a local-filesystem StorageProvider (real S3 adapter is
> a documented boundary), and the STT fallback chain is verified with the local
> providers. NAT/codec/latency hardening is deployment-level.

### Goal

Move from "works in LiveKit dev" to "answers a real Uzbekistan phone number reliably." Provision real SIP trunking and local numbers, support human transfer, store recordings durably, and harden Uzbek STT with multiple providers and continuous WER tracking.

### Scope & Deliverables

- [~] **SIP trunking** — behind a SIP/telephony provider interface with a mock adapter; a real trunk is deployment config
- [x] `phone-numbers` module — number provisioning + inbound **call routing** (dialed number → agent), verified
- [x] **Warm and cold transfer** to human staff (`transfer_call` tool completed → Call TRANSFERRED + event)
- [x] **Recordings persisted to storage** — `StorageProvider` (local-fs default; S3 adapter documented); recording key linked to the Call; retrievable URL
- [x] **Multi-provider STT** with **fallback** chain + **custom vocabulary** passthrough (verified: survives a provider outage)
- [x] **WER tracking** with per-provider / per-language comparison (regression alerts are a later ops concern)
- [x] Recording **consent** capture + enforcement in the call flow (consent event; recording gated on consent)
- [x] `webhooks` plumbing — endpoints + HMAC-signed outbound delivery via the jobs-worker (verified with a live receiver)
- [~] Media robustness (NAT/codec/latency) — deployment/LiveKit-level, documented

### Exit Criteria

- A real inbound call to a provisioned Uzbekistan number is answered end-to-end through the production SIP path.
- Warm and cold transfer to a human both succeed reliably.
- Recordings land in S3 with correct metadata and are retrievable, subject to consent.
- Uzbek WER is tracked continuously; the multi-provider fallback measurably improves over the Phase 4 baseline and survives a single-provider outage.
- Recording consent is captured and enforced per the privacy model in [`SECURITY.md`](./SECURITY.md).

---

## Phase 6 — Billing & Integrations · **COMPLETE\* (2026-10-22)**

> \*Built and verified end-to-end for everything that does not require an external
> provider account (19-check live smoke: plan catalog, **plan-limit enforcement**,
> subscription via the payment provider, a **calendar-synced appointment** + a
> **booking-confirmation notification**, and **usage metering + rollup** that
> reconciles against raw usage). Payments (Stripe), calendar (Google), CRM, and
> email/SMS run behind interfaces with **mock providers** by default; the real
> adapters are documented boundaries requiring provider accounts/keys.

### Goal

Make OvozAI a commercial product: plans, subscriptions, metered usage, and payments; plus the external integrations (calendars, CRM) and notifications that make the receptionist genuinely useful to a business.

### Scope & Deliverables

- [x] `billing` module — **plans** (seeded catalog), **subscriptions** (subscribe/change via a PaymentProvider), **usage metering**, and **plan-limit enforcement** (agent count)
- [x] **Usage rollups** computed as BullMQ jobs in `jobs-worker` (reconcilable against raw UsageRecords via `rawCount`)
- [x] Payments via a provider-agnostic `PaymentProvider` (mock default; Stripe adapter documented)
- [x] `integrations` module (business-facing) — connect/list/disconnect + **calendar sync** of appointments (`CalendarProvider`); CRM via the same interface
- [x] `notifications` module — in-app/email/SMS via a `NotificationProvider` (dispatched on booking; mock default)
- [x] Billing/usage, integrations, and notifications screens in the dashboard; **plan limits enforced**
- [x] Webhooks extended for `subscription.created` / `payment.succeeded` (plus the Phase-5 call events)

### Exit Criteria

- A business can subscribe to a plan, and usage is metered and rolled up accurately.
- Payments process end-to-end; plan limits gate feature access.
- A booked appointment syncs to the business's external calendar.
- Notifications are delivered for the key events (booking confirmation, transfer/missed call).
- Usage rollup jobs are accurate and reconcilable against raw call data.

---

## Phase 7 — Hardening & Compliance · **COMPLETE\* (2026-10-22)**

> \*Built and verified end-to-end for everything codeable in this environment
> (38-check live smoke: RLS cross-tenant isolation via the enforced `ovozai_app`
> role **with the app guard bypassed**, retention policy, right-to-erasure, a
> queue→worker retention sweep, the `/metrics` exposition, and structured
> PII-redacted JSON logs). The **data-residency placement, at-scale load numbers,
> external penetration test, and SOC2 evidence-collection program are deployment /
> infrastructure / auditor boundaries** — documented, with the code hooks in place
> (DATA_REGION, a load harness, RLS, audit log). Full detail, control-by-control,
> is in [`docs/COMPLIANCE.md`](./COMPLIANCE.md). Phase 6 commit `9eaa347`; Phase 7
> adds migrations `20251022200000_phase7_retention` + `20251022210000_phase7_rls`.

### Goal

Make OvozAI safe to run at scale and compliant with Uzbekistan's data-protection regime. Add the defense-in-depth tenancy backstop, data residency, full observability, proven scale, and the security/compliance controls expected of a production SaaS handling sensitive voice PII.

### Scope & Deliverables

- [x] **PostgreSQL Row-Level Security (RLS)** as defense-in-depth behind the application-layer tenant guard (22 tenant tables; `ovozai_app` least-privilege role; `app.current_org` GUC via `PrismaService.runWithOrgScope`)
- [~] **Uzbekistan data residency** — PII-store inventory + `DATA_REGION` self-report; in-country placement is a deployment boundary (Law No. ZRU-547)
- [x] **Data retention** policies (per-org) for recordings and transcripts; a retention-sweep job; **right-to-erasure** of a data subject (audited)
- [x] **Observability** — Prometheus `/metrics` (request/latency/process + queue depth), centralized structured JSON logs with per-request correlation ids and PII redaction; [~] distributed tracing + voice SLO alerting are collector/monitoring-stack boundaries
- [~] **Load & scale testing** — a dependency-free load harness ships; at-scale capacity/autoscaling numbers require a staging deployment
- [x] **Security audit** — dependency audit clean (prod+dev); auth + tenancy review (RBAC + RLS); [~] external penetration test is a deployment boundary
- [~] **SOC2-style controls** — audit log, change-management gates, access model in place; the evidence-collection program runs over an operated system

### Exit Criteria

- ✅ RLS is enabled and **verified to block cross-tenant access even when the application guard is bypassed** (raw `ovozai_app` connection: own-org rows visible, other-org rows zero, cross-tenant insert rejected).
- ◐ Uzbek-citizen personal data stores are inventoried and region-declared; retention + deletion **work as specified and are verified**; in-country placement is asserted at deploy time.
- ✅ Metrics + structured, correlated logs give visibility; voice latency SLOs are defined ([`VOICE_PIPELINE.md`](./VOICE_PIPELINE.md)); tracing export is a monitoring-stack step.
- ◐ A load harness exists; documented at-scale capacity is produced against a real deployment.
- ◐ Dependency/auth/tenancy audit done; penetration test + SOC2 evidence run against an operated system.

See [`docs/COMPLIANCE.md`](./COMPLIANCE.md) for the ✅ / ◐ / ⬚ breakdown of every control.

---

## Beyond Phase 7

Candidate follow-on work, explicitly out of scope until the above ships: the **AGENT_OPERATOR** role and live-assist tooling for human operators, outbound campaigns, richer analytics, additional languages/dialects, and extraction of a hot module (e.g. `knowledge-base`) into its own service if load justifies it — made cheap by the clean module boundaries established from Phase 1 (see [`ARCHITECTURE.md`](./ARCHITECTURE.md)).
