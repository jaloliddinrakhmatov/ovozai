# OvozAI

> AI-powered Voice Receptionist SaaS for businesses in Uzbekistan — AI voice agents
> that answer phone calls in **Uzbek, Russian, and English**, answer questions from a
> knowledge base, book appointments, and transfer calls to human staff.

**Status:** Phase 3 complete — AI agents (config + versioning), a knowledge base
(document ingestion → chunking → embeddings → retrieval, with embedding jobs run by the
`jobs-worker`), customers, and appointments, on top of the Phase 1–2 foundation
(auth, multi-tenancy, RBAC, dashboard). Voice calling, telephony, and billing arrive in
later phases. See [`docs/ROADMAP.md`](docs/ROADMAP.md). Note: knowledge-document ingestion
requires the `jobs-worker` and Redis running (`pnpm dev` starts all apps).

---

## Tech stack

| Area | Choice |
| --- | --- |
| Monorepo | Turborepo 2.11 + pnpm 12 workspaces (version **catalog**) |
| Frontend | Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · shadcn/ui-style components |
| Backend | NestJS 12 (modular monolith) |
| Database | PostgreSQL 16 + Prisma 7 (driver adapter: `@prisma/adapter-pg`) |
| Cache / queues | Redis 7 + BullMQ 6 |
| Language | TypeScript 5.9 (strict) |
| Lint / format | ESLint 10 (flat config) + Prettier 3 |
| Tests | Vitest 5 (unit + API e2e) + Playwright 1.64 (browser e2e) |
| Infra (dev) | Docker Compose (PostgreSQL + Redis) |

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design and the version-pinning
rationale (notably: TypeScript stays on 5.9 for `typescript-eslint` compatibility, and
Prisma stays on stable 7.x because npm `latest` is an 8.0 release candidate).

## Prerequisites

- **Node.js ≥ 20.9** (developed on 24.x). `.nvmrc` pins `24`.
- **pnpm 12** via Corepack (bundled with Node — no separate install):
  ```bash
  corepack enable            # or: corepack prepare pnpm@12.14.0 --activate
  ```
- **PostgreSQL 16+ and Redis 7** — via **Docker Compose** (`pnpm docker:up`, recommended) **or**
  natively. Docker-free on macOS: `brew services start postgresql@17` and
  `brew install redis && brew services start redis`, then create the role/db to match
  `DATABASE_URL` (`psql postgres -c "CREATE ROLE ovozai LOGIN PASSWORD 'ovozai' SUPERUSER;" -c
  "CREATE DATABASE ovozai OWNER ovozai;"`). Building and testing need no database at all.

## Quick start

```bash
# 1. Enable pnpm (once)
corepack enable

# 2. Environment
cp .env.example .env

# 3. Install dependencies
pnpm install        # if prompted about build scripts: pnpm approve-builds --all

# 4. Start infrastructure (PostgreSQL + Redis)
pnpm docker:up

# 5. Database: generate the client and apply the initial migration
pnpm db:generate
pnpm db:migrate:deploy      # applies the baseline migration to the running DB
pnpm db:seed                # optional: demo organization + owner

# 6. Run everything (web + api + workers) in watch mode
pnpm dev
```

Then open:

- Web: <http://localhost:3000>
- API liveness: <http://localhost:3001/api/v1/health>
- API readiness: <http://localhost:3001/api/v1/health/ready>

The landing page shows a live **backend connection status** pill that polls the API's
liveness endpoint.

## Services & ports

| App | Package | Port | Description |
| --- | --- | --- | --- |
| web | `@ovozai/web` | 3000 | Next.js landing page + (future) dashboard |
| api | `@ovozai/api` | 3001 | NestJS business backend (base path `/api/v1`) |
| voice-worker | `@ovozai/voice-worker` | — | LiveKit real-time agent (Phase 4 scaffold) |
| jobs-worker | `@ovozai/jobs-worker` | — | BullMQ background jobs (scaffold) |
| PostgreSQL | docker-compose | 5432 | primary database |
| Redis | docker-compose | 6379 | cache + queues |

## Scripts (run from the repo root)

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run all apps in watch mode (Turborepo) |
| `pnpm build` | Build every package and app |
| `pnpm typecheck` | `tsc --noEmit` across the monorepo |
| `pnpm lint` | ESLint across the monorepo |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm --filter @ovozai/api test:e2e` | API end-to-end tests (boots the app) |
| `pnpm --filter @ovozai/web test:e2e` | Browser e2e (Playwright — run `playwright install chromium` once) |
| `pnpm format` / `pnpm format:check` | Prettier write / check |
| `pnpm docker:up` / `pnpm docker:down` | Start / stop PostgreSQL + Redis |
| `pnpm db:generate` | Generate the Prisma client |
| `pnpm db:migrate` | Create + apply a dev migration (`prisma migrate dev`) |
| `pnpm db:migrate:deploy` | Apply pending migrations (`prisma migrate deploy`) |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm db:seed` | Seed a demo organization |

You can target a single workspace with `pnpm --filter <name> <script>`, e.g.
`pnpm --filter @ovozai/api dev`.

## Monorepo layout

```
.
├── apps/
│   ├── web/            # Next.js 16 frontend (landing + backend status)
│   ├── api/            # NestJS 12 modular monolith (health module in Phase 1)
│   ├── voice-worker/   # LiveKit real-time voice agent (Phase 4 scaffold)
│   └── jobs-worker/    # BullMQ background job processor (scaffold)
├── packages/
│   ├── database/       # Prisma schema, migrations, generated client, seed
│   ├── contracts/      # zod schemas + shared types (health, errors, pagination)
│   ├── ui/             # shadcn/ui-style shared React components (Button, cn)
│   ├── config/         # shared tsconfig / eslint / prettier presets
│   └── integrations/   # provider-agnostic STT / LLM / TTS interfaces
├── infrastructure/     # IaC / ops config (grows in later phases)
├── docs/               # architecture, database, API, voice pipeline, security, roadmap
├── docker-compose.yml  # PostgreSQL + Redis (dev)
├── pnpm-workspace.yaml # workspaces + version catalog
├── turbo.json          # task pipeline
└── .env.example        # environment template
```

## Health checks

- `GET /api/v1/health` — **liveness**: always `200` while the process is up.
- `GET /api/v1/health/ready` — **readiness**: checks PostgreSQL + Redis; `200` when both
  are reachable, `503` with per-dependency detail otherwise. (Powered by `@nestjs/terminus`.)

## Documentation

| Doc | Contents |
| --- | --- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design, components, ADRs, deployment |
| [`docs/DATABASE.md`](docs/DATABASE.md) | Data model, multi-tenancy, migrations, PII |
| [`docs/API.md`](docs/API.md) | REST conventions, auth, errors, endpoint catalog |
| [`docs/VOICE_PIPELINE.md`](docs/VOICE_PIPELINE.md) | Real-time call flow, providers, latency |
| [`docs/SECURITY.md`](docs/SECURITY.md) | AuthN/Z, tenant isolation, Uzbekistan data residency |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Phased delivery plan |

## Troubleshooting

- **`pnpm: command not found`** — run `corepack enable`. If Corepack cannot symlink into a
  system directory, enable it into a user directory and add it to `PATH`:
  `corepack enable --install-directory "$HOME/.local/bin" pnpm`.
- **`ERR_PNPM_IGNORED_BUILDS` during install** — pnpm gates dependency build scripts. Run
  `pnpm approve-builds --all` (the approved list is stored in `pnpm-workspace.yaml`).
- **Readiness returns 503** — PostgreSQL and/or Redis are not running. Start them with
  `pnpm docker:up`. The API intentionally boots and serves liveness even when they are down.
- **Prisma client missing** — run `pnpm db:generate` (the generated client is git-ignored).
