# CLAUDE.md

Guidance for Claude Code (claude.com/claude-code) working in the **OvozAI** monorepo.

## What this is

OvozAI is a multi-tenant, AI-powered Voice Receptionist SaaS for businesses in Uzbekistan:
AI voice agents answer phone calls in Uzbek/Russian/English, answer from a knowledge base,
book appointments, and transfer to humans. Architecture: a NestJS **modular monolith**
(`apps/api`) + a separately deployable **real-time voice worker** (`apps/voice-worker`) +
a **BullMQ jobs worker** (`apps/jobs-worker`) + a **Next.js** frontend (`apps/web`).

Current stage: **Phase 7 complete** (hardening & compliance; also Phases 1–6) — **all roadmap
phases are delivered.** Phase 7 shipped the codeable/verifiable controls (RLS, retention +
right-to-erasure, observability) and documented the infra/policy boundaries (in-country residency,
at-scale load, external pentest, SOC2 evidence) in `docs/COMPLIANCE.md`. Scope and sequencing live
in `docs/ROADMAP.md`. Full design is in `docs/` (ARCHITECTURE, DATABASE, API, VOICE_PIPELINE,
SECURITY, COMPLIANCE).

> Phases 4–5 note: the voice loop is verified via a **simulated (text-driven) call**. The parts
> that need external infra are built behind interfaces but **not exercised here**: the live
> **LiveKit** audio hop (`apps/voice-worker/src/livekit-transport.ts`), a real **SIP trunk** /
> UZ number provisioning, real **S3** (local-fs `StorageProvider` is the default), and additional
> live STT/LLM/TTS provider keys.

## Toolchain & commands

- **Package manager: pnpm 12 via Corepack.** If `pnpm` is missing: `corepack enable`
  (or into a user dir: `corepack enable --install-directory "$HOME/.local/bin" pnpm`).
- Node ≥ 20.9 (dev on 24). Versions are centralized in the **catalog** in
  `pnpm-workspace.yaml`; packages reference deps as `"catalog:"` / `"workspace:*"`.
  Add/upgrade a shared version in the catalog, not in individual package.json files.
- **Docker is optional.** `pnpm docker:up` is the convenient path, but PostgreSQL + Redis can
  come from anywhere. Docker-free local dev (macOS/Homebrew): `brew services start postgresql@17`,
  `brew install redis && brew services start redis`, then create the role/db to match
  `DATABASE_URL` (`CREATE ROLE ovozai LOGIN PASSWORD 'ovozai' SUPERUSER; CREATE DATABASE ovozai
  OWNER ovozai;`). The build/typecheck/lint/test pipeline and the API boot need no DB at all.

```bash
pnpm install                 # if it stops on build scripts: pnpm approve-builds --all
pnpm dev                     # all apps in watch mode (turbo)
pnpm build                   # build everything
pnpm typecheck               # tsc --noEmit everywhere
pnpm lint                    # eslint (flat config) everywhere
pnpm test                    # vitest unit tests
pnpm --filter @ovozai/api test:e2e   # boots the app, hits health over HTTP
pnpm docker:up               # PostgreSQL + Redis (requires Docker)
pnpm db:generate             # regenerate the Prisma client (git-ignored)
pnpm db:migrate:deploy       # apply migrations to a running DB
```

## Layout

- `apps/` — `web` (Next 16), `api` (Nest 12), `voice-worker`, `jobs-worker`.
- `packages/` — `database` (Prisma), `contracts` (zod schemas/types), `ui` (React components),
  `config` (tsconfig/eslint/prettier presets), `integrations` (STT/LLM/TTS interfaces).
- Package scope is `@ovozai/*`. Shared code: put cross-app types/validation in
  `@ovozai/contracts`, DB access types in `@ovozai/database`, UI in `@ovozai/ui`.

## Conventions

- Strict TypeScript. ESLint flat config + Prettier come from `@ovozai/config`; a package's
  `eslint.config.mjs` imports `@ovozai/config/eslint` (or `/eslint/react` for React) and its
  tsconfig extends `@ovozai/config/tsconfig/{base,library,nestjs,nextjs}.json`.
- Libraries (`contracts`, `ui`, `integrations`) build with **tsup** (ESM+CJS+d.ts).
- The API is CommonJS and builds with `nest build`. Tests use **Vitest**; the API's vitest
  config uses `unplugin-swc` so decorator metadata is emitted.
- Never hardcode secrets. `.env` is git-ignored; `.env.example` is committed. New env vars go
  in `.env.example` with a `[PHASE 1]` marker when needed now.

## Non-obvious gotchas (read before touching these areas)

- **Versions are deliberate.** TypeScript is pinned to **5.9** because `typescript-eslint`
  caps at `<6.1` (TS 7 breaks linting). Prisma is pinned to **7.10** because npm `latest`
  is an `8.0.0` release candidate. Don't "upgrade to latest" without checking peers.
- **Prisma 7 uses the driver-adapter model.** The datasource block has **no `url`**;
  CLI connection config is in `packages/database/prisma.config.ts` (which loads `.env`
  itself), and the client is constructed with `new PrismaClient({ adapter: new PrismaPg(...) })`
  (see `apps/api/src/prisma/prisma.service.ts`). The generated client lives in
  `packages/database/src/generated/` (git-ignored) — run `pnpm db:generate` after changing the
  schema. Create a migration offline with
  `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script -o <file>`.
- **`@prisma/client-runtime-utils` is a direct dep of `@ovozai/database`** on purpose — pnpm's
  strict linking otherwise can't resolve it from the custom generated-client path at runtime.
- **pnpm gates build scripts.** Approve with `pnpm approve-builds --all`; the allowlist is the
  `allowBuilds:` map in `pnpm-workspace.yaml` (not `onlyBuiltDependencies`, not `.npmrc`).
- **tsconfig path options** (`rootDir`, `outDir`) must NOT live in the shared presets — they
  resolve relative to the preset's own location. Set them in the consuming app's tsconfig
  (e.g. `apps/api/tsconfig.build.json`).
- **The API boots without PostgreSQL/Redis.** Connections are lazy; liveness is always `200`
  and readiness reports dependencies as `down` (`503`). Keep it that way.
- **NestJS DI needs value imports** of injected classes (for decorator metadata), so
  `@typescript-eslint/consistent-type-imports` is turned off in `apps/api/eslint.config.mjs`.
  Don't convert injected constructor params to `import type`.
- **`PrismaService` exposes two clients (Phase 2).** `prisma.tenant` auto-scopes tenant-bound
  models to the active org via the Prisma extension (`src/tenancy/`), keyed off an
  `AsyncLocalStorage` context set per request by `TenantInterceptor` from the authenticated
  principal. `prisma.base` is unscoped — use it only for global models (User, Organization,
  Membership, Session, AuditLog) and bootstrap ops that precede a tenant context (login,
  invite-accept-by-token, API-key verification). On a tenant-scoped model the extension
  **forbids** `findUnique`/`update`/`delete`/`upsert` (their `where` can't carry the tenant
  filter) — use `findFirst`/`updateMany`/`deleteMany` instead. The scoped set is in
  `tenant.extension.ts` and grows as later phases add tenant tables.
- **Auth model (Phase 2).** Short-lived access JWT (HS256, `JWT_ACCESS_SECRET`) + opaque
  rotating refresh token `<sessionId>.<secret>` backed by the `Session` row (reuse of a rotated
  token revokes the session). Passwords use **argon2id**. Global guards live in `AuthModule`
  (`APP_GUARD`): `JwtAuthGuard` (skip with `@Public()`), then `RolesGuard` (`@Roles(minRole)`,
  deny-by-default, hierarchy-aware). Errors are RFC 9457 problem+json via `ProblemDetailsFilter`;
  validate input with `new ZodValidationPipe(schema)` against `@ovozai/contracts`. Redis-backed
  rate-limit + session denylist are best-effort (fail open) so the API still boots without Redis.
- **Knowledge-base embeddings (Phase 3).** Stored as `Float[]` with app-side **exact cosine**
  retrieval (see `KnowledgeService.query`), not pgvector — pgvector/HNSW is the Phase-7 scale
  upgrade. The embedding provider is pluggable (`@ovozai/integrations` `createEmbeddingProvider`);
  the default is a **local deterministic lexical embedder** (no API key). The **API and the
  jobs-worker must share the `EMBEDDING_*` env** so query and chunk vectors use the same model
  (retrieval filters chunks by `embeddingModel`). Document ingestion is async: the API creates
  the doc `PENDING` and enqueues a BullMQ job; **`apps/jobs-worker` must be running** for it to
  become `READY` (it chunks → embeds → stores chunks; retries with backoff; terminal `FAILED`).
- **Tenant-scoped models now include** Agent, AgentVersion, KnowledgeBase, KnowledgeDocument,
  KnowledgeChunk, Customer, Appointment, Call, CallEvent, Transcript, TranscriptTurn, UsageRecord
  (see `tenant.extension.ts`). Same rule: on these, use `findFirst`/`updateMany`/`deleteMany` via
  `prisma.tenant`, never `findUnique`/`update`/`delete`. Workers and the internal channel run
  outside any request, so they use the **unscoped base client with an explicit `organizationId`**.
- **Voice MVP (Phase 4).** `apps/voice-worker` runs the STT→LLM→TTS loop (`CallSession`) behind
  an `AudioTransport` interface: `SimulatedTransport` (text-driven, used for tests/the dev call)
  and `livekit-transport.ts` (the live media hop — NOT wired; needs a server + `@livekit/rtc-node`).
  Providers come from `@ovozai/integrations` `createVoiceProviders` (local default; OpenAI-compatible
  real adapters). The worker reports to the **internal channel** `/internal/v1/...` (excluded from
  the `api/v1` prefix in `main.ts`), authenticated by `InternalAuthGuard` with a service token +
  HMAC over the **raw body** (so `NestFactory.create(AppModule, { rawBody: true })` is required).
  `INTERNAL_SERVICE_TOKEN`/`INTERNAL_HMAC_SECRET` must match between api and worker. The public
  `calls` module is read-only; all call/transcript/usage writes go through `/internal/v1`. Run a
  demo: start the API, then `VOICE_DEV_CALL_AGENT_ID=<agentId>` on the voice-worker.
- **Telephony (Phase 5).** Inbound routing resolves `toE164` → `PhoneNumber` → `Agent` in the
  internal `createCall`. `transfer_call` sets the Call to `TRANSFERRED`. **Recordings** go through
  `@ovozai/integrations` `createStorageProvider` (local-fs default under a shared temp dir, so the
  worker writes and the API builds the URL — keep `STORAGE_*` identical between them; real S3 is a
  documented boundary), gated on `recordingConsent` (set when the agent has a `config.consentAnnouncement`).
  **Webhooks**: `WebhooksService.dispatch()` (base client) creates `WebhookDelivery` rows + enqueues
  the `webhook` BullMQ queue; the jobs-worker signs HMAC-SHA256 over `"<t>.<body>"` with the endpoint
  `secret` (stored recoverable, not hashed). **WER**: recorded via the internal channel (server
  computes `computeWer`), read via `/wer/summary`. **Multi-provider STT fallback**: `createFallbackStt`.
- **Billing & integrations (Phase 6).** `Plan` is global (seeded by `prisma/seed.ts`); everything
  else is tenant-scoped. **Subscriptions** go through a `PaymentProvider` (`@ovozai/integrations`
  `createPaymentProvider`; mock default, Stripe documented) and are **upserted via the base client**
  (the tenant extension forbids `upsert`). **Plan limits**: `PlanLimitsService.assertCanCreateAgent`
  (BillingModule, exported) gates agent creation; falls back to the `free` plan when no subscription.
  **Usage rollups**: `POST /billing/usage/rollup` enqueues the `usage-rollup` BullMQ queue; the
  jobs-worker aggregates `UsageRecord` → `UsageRollup` (upsert, idempotent, `rawCount` for
  reconciliation). **Calendar sync + notifications + webhooks** are best-effort side effects of
  appointment creation (both the `/appointments` path and the agent `book_appointment` tool), via
  `IntegrationsService.syncAppointmentToCalendar` / `NotificationsService.dispatch` /
  `WebhooksService.dispatch` — all use the base client with an explicit org so they work in and out
  of request context. Business providers (`createPaymentProvider`/`createCalendarProvider`/
  `createNotificationProvider`) default to mock; real adapters are documented boundaries.
- **Hardening & compliance (Phase 7).** **RLS** is defense-in-depth *behind* the Phase-2 tenant
  extension (still the primary guard). The migration `..._phase7_rls` enables RLS + a
  `tenant_isolation` policy (keyed on the GUC `app.current_org`) on all 22 tenant tables; the
  enforced role `ovozai_app` is created **out of band** by `infrastructure/rls/create-app-role.sql`
  (a superuser op — NOT in the Prisma migration, which can't/shouldn't `CREATE ROLE`). The dev app
  still connects as the owner (bypasses RLS); set `DATABASE_APP_URL` to the `ovozai_app` connection
  to activate the enforced path. `PrismaService` gains `enforced` + `runWithOrgScope(org, fn)`
  (wraps a tx in `set_config('app.current_org', …, true)`) and `rlsEnforced`. Verify RLS directly:
  `SET ROLE ovozai_app; SET app.current_org='…'; SELECT …` (foreign org → 0 rows). **Retention +
  erasure** live in `apps/api/src/compliance/` (per-org `recording/transcriptRetentionDays` on
  Organization; `POST /compliance/erasure` is synchronous + audited; `POST /compliance/retention/
  sweep` enqueues the `retention` BullMQ queue → `apps/jobs-worker` purges via `StorageProvider`
  (now has `delete`) + Prisma). **Observability**: `GET /api/v1/metrics` (Prometheus, no
  prom-client dep) via `MetricsModule` + a global `HttpMetricsInterceptor`; `LOG_FORMAT=json` swaps
  in `StructuredLogger` (per-request `requestId` via an `AsyncLocalStorage` set in the request-id
  middleware; every line PII-redacted via `common/redaction.ts`). Infra/policy items (residency
  placement, at-scale load, pentest, SOC2) are documented boundaries in `docs/COMPLIANCE.md`.

## Verifying a change

Run `pnpm build && pnpm typecheck && pnpm lint && pnpm test`. For runtime checks of the API,
`pnpm --filter @ovozai/api test:e2e` boots the app without needing a database. Live DB/Redis
features need `pnpm docker:up` (Docker must be installed).
