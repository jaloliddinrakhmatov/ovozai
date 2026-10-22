# OvozAI — Deployment Guide

> **Status:** 2026-10-22 · Companion to [`PRODUCTION_READINESS.md`](./PRODUCTION_READINESS.md).
> **Honest note:** the repo has **no Dockerfiles, CI, or IaC today** (dev runs via `pnpm dev` +
> local Postgres/Redis). This guide gives the target architecture, the exact gaps to fill, and a
> pragmatic first-deployment path for a pilot.

## 1. Runtime components

| Component | What | Scale unit |
| --- | --- | --- |
| `apps/web` | Next.js 16 dashboard | stateless, 1–2 instances |
| `apps/api` | NestJS control plane (`/api/v1`, `/internal/v1`, `/metrics`) | stateless, 1–2 |
| `apps/jobs-worker` | BullMQ worker (embedding, webhook, usage-rollup, retention) | 1+, Redis-bound |
| `apps/voice-worker` | Voice gateway (WS :8787) + call orchestration | 1+ per concurrent-call pool |
| PostgreSQL 16+ | primary store (+ RLS role `ovozai_app`) | managed, in-country |
| Redis 7 | cache + queues + rate-limit/denylist | managed |
| Object storage | call recordings (S3-compatible) | in-country bucket |
| LiveKit + SIP trunk | **real phone** media plane (NOT wired yet) | VM / LiveKit Cloud |
| Voice providers | STT/LLM/TTS (NeuronAI, Groq, …) | external APIs (usage-billed) |

Shared invariants: `INTERNAL_SERVICE_TOKEN`/`INTERNAL_HMAC_SECRET` identical between api + voice-worker;
`EMBEDDING_*` identical between api + jobs-worker; `STORAGE_*` identical between api + voice-worker +
jobs-worker; the voice-worker's `VOICE_WS_PORT` must match the api's `VOICE_WS_PUBLIC_URL`.

## 2. Gaps to fill before deploying (do these first)

1. **Dockerfiles** — one per app. API is CommonJS (`nest build` → `node dist/main.js`); workers are
   ESM (`tsup` → `node dist/main.js`); web is `next build` / `next start`. Build from the monorepo
   root so `workspace:*`/`catalog:` resolve; run `pnpm db:generate` in the image that needs Prisma.
2. **CI** — add `.github/workflows` running `pnpm build && typecheck && lint && test` on PRs, and an
   image build/publish on main. (The roadmap referenced CI; it is not in the repo.)
3. **Migrations in deploy** — run `prisma migrate deploy` (not `dev`) as a release step; then the
   out-of-band RLS role once per cluster (`infrastructure/rls/create-app-role.sql`, superuser), and
   `pnpm db:seed` for the Plan catalog.
4. **Secrets** — move every key out of `.env` into the platform's secret manager; generate strong
   `JWT_ACCESS_SECRET`, `INTERNAL_*` (`openssl rand -hex 32`).
5. **Backups** — automated PostgreSQL snapshots + object-store versioning + a **tested restore**.
6. **Monitoring** — point Prometheus at each api/worker `/metrics`; ship JSON logs to aggregation.

## 3. Environment variables (production)

All are documented in [`.env.example`](../.env.example). Production-critical:

- **Core:** `NODE_ENV=production`, `DATABASE_URL`, `REDIS_URL`, `CORS_ORIGINS`, `APP_WEB_URL`,
  `NEXT_PUBLIC_API_URL`.
- **Auth (required, strong):** `JWT_ACCESS_SECRET` (≥32, not `dev-insecure`), token TTLs.
- **Internal channel (must match):** `INTERNAL_SERVICE_TOKEN`, `INTERNAL_HMAC_SECRET`.
- **RLS (defense-in-depth):** `DATABASE_APP_URL` = the `ovozai_app` connection.
- **Storage:** `STORAGE_PROVIDER=s3` + `STORAGE_S3_*` (in-country bucket).
- **Voice providers (per-modality):** `VOICE_LLM_PROVIDER/BASE_URL/API_KEY/MODEL`,
  `VOICE_TTS_PROVIDER/BASE_URL/API_KEY/MODEL`, `VOICE_STT_*`; `VOICE_WS_PUBLIC_URL`,
  `VOICE_WS_PORT`. (NeuronAI: LLM `gemma-4-26b-a4b`, TTS `kamron`; Groq alt LLM `qwen`.)
- **Observability/compliance:** `LOG_FORMAT=json`, `METRICS_ENABLED=true`, `DATA_REGION=uz`.
- **Later:** `LIVEKIT_*` (real phone), `PAYMENT_API_KEY` (real billing), calendar/notification keys.
- The API **boots without DB/Redis** (liveness 200, readiness 503) — keep probes on `/health` and
  `/health/ready`.

## 4. Recommended approach

**For the pilot (simplest, in-country):** a **single VM in an Uzbekistan region** running the four
apps via `docker-compose` (add a production compose that uses built images + managed or
same-host Postgres/Redis), behind a reverse proxy (Caddy/Traefik) for TLS. Managed Postgres + Redis
if available in-country; otherwise same-host with disciplined backups. Object storage: a local
S3-compatible store (MinIO — already stubbed in docker-compose) on the VM or a UZ provider.

**For scale (later):** container platform / k8s — web+api behind a load balancer (stateless, HPA),
jobs-worker and voice-worker as separate deployments (voice-worker scaled by concurrent-call
capacity), managed Postgres with read replicas + pgvector (the Phase-7 retrieval upgrade), managed
Redis, CDN for web.

**Real phone (SIP):** stand up **LiveKit** (self-host on a VM or LiveKit Cloud), wire
`apps/voice-worker/src/livekit-transport.ts` with `@livekit/rtc-node`, configure LiveKit SIP ingress
+ dispatch rules, and contract a **UZ SIP trunk / numbers** (e.g. SIP.UZ / local carrier). Map each
number → agent via the existing `phone-numbers` routing. **Verify interop before onboarding.**

## 5. First-deploy checklist

- [ ] Provision: VM (UZ region), Postgres 16+, Redis 7, S3 bucket, domain + TLS.
- [ ] Add Dockerfiles + a production compose; build images in CI.
- [ ] Set all env/secrets in the secret manager (strong values).
- [ ] `prisma migrate deploy` → `create-app-role.sql` (superuser) → set `DATABASE_APP_URL` → `db:seed`.
- [ ] Deploy web/api/jobs-worker/voice-worker; confirm `/health/ready` = 200 and `/metrics` scrapes.
- [ ] Configure voice providers (NeuronAI/Groq keys + credits); run the voice smoke against staging.
- [ ] Enable backups + test a restore; wire monitoring + alerts.
- [ ] (For phone) stand up LiveKit + SIP trunk + a UZ number; verify a real inbound call.
- [ ] Load test with `infrastructure/loadtest/loadtest.mjs`; record capacity.
