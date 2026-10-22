# OvozAI — Hardening & Compliance (Phase 7)

> **Status:** Phase 7 · **Last updated:** 2026-10-22
>
> This document consolidates the security, privacy, and operational-hardening
> controls for OvozAI, and — in the honest spirit of the roadmap — marks clearly
> which controls are **implemented and verified in this repository** versus which
> are **deployment / infrastructure / external-auditor boundaries** that cannot be
> exercised in a local build. It is the Phase-7 companion to
> [`SECURITY.md`](./SECURITY.md) (threat model, authn/z) and
> [`ARCHITECTURE.md`](./ARCHITECTURE.md).

Legend: ✅ built & verified here · ◐ built behind an interface, cutover is a
deployment step · ⬚ policy/infra/auditor boundary (documented, not codeable here).

| # | Control | State |
| --- | --- | --- |
| 1 | PostgreSQL Row-Level Security (defense-in-depth tenancy) | ✅ / ◐ |
| 2 | Uzbekistan data residency (Law No. ZRU-547) | ◐ / ⬚ |
| 3 | Data retention + right-to-erasure | ✅ |
| 4 | PII handling & log redaction | ✅ |
| 5 | Observability (metrics, structured logs, tracing) | ✅ / ⬚ |
| 6 | Load & scale testing | ✅ (harness) / ⬚ (at-scale) |
| 7 | Security audit & SOC2-style controls | ◐ / ⬚ |

---

## 1. PostgreSQL Row-Level Security (RLS)

RLS is the **defense-in-depth backstop behind the application-layer tenant guard**
(the Prisma client extension in `apps/api/src/tenancy/`, Phase 2). The app guard is
the primary control; RLS ensures that even if it were bypassed — a missed
`prisma.tenant` call, a raw query, a logic bug — the database itself refuses to
return or write another tenant's rows.

### Design

- **A dedicated, least-privilege role `ovozai_app`.** It is **not** a superuser and
  does **not** own the tables, so PostgreSQL enforces RLS for it. (Superusers and
  table owners bypass RLS unless `FORCE ROW LEVEL SECURITY` is set — which is why
  the migration owner `ovozai` keeps working unchanged while RLS is layered in.)
  The role is created out of band (see below), not in an app migration: role and
  privilege management requires superuser and managed-Postgres deploy roles
  typically cannot `CREATE ROLE`.
- **A policy on every tenant-scoped table** (22 tables — all those carrying
  `organization_id`), keyed on a transaction-local GUC:

  ```sql
  CREATE POLICY tenant_isolation ON <table> FOR ALL
    USING      (organization_id = current_setting('app.current_org', true))
    WITH CHECK (organization_id = current_setting('app.current_org', true));
  ```

  `current_setting('app.current_org', true)` returns `NULL` when the GUC is unset,
  so a missing tenant context yields **zero rows and blocks inserts** (fail-closed).
- **Global tables** (`organizations`, `users`, `memberships`, `sessions`,
  `audit_logs`, `plans`) are intentionally **not** under RLS: they are used before
  or across a tenant context (auth bootstrap) and are governed by the app-layer
  guard. This mirrors the Phase-2 tenant extension's global set exactly.

Migration: `packages/database/prisma/migrations/20251022210000_phase7_rls/` enables
RLS + the policies. The role is created by
[`infrastructure/rls/create-app-role.sql`](../infrastructure/rls/create-app-role.sql).

### Production cutover

1. Create the role once per cluster (superuser), supplying a password at runtime:
   ```bash
   psql "$SUPERUSER_DATABASE_URL" \
     -v app_password="$(openssl rand -hex 24)" \
     -f infrastructure/rls/create-app-role.sql
   ```
2. Set `DATABASE_APP_URL` for `apps/api` to the `ovozai_app` connection string.
   `PrismaService` then exposes an RLS-enforced client and `runWithOrgScope(org, fn)`
   binds `app.current_org` for the transaction. `rlsEnforced` reports which mode is
   active (`GET /api/v1/compliance/rls-status`).

> **Current adoption.** The migration + policies ship enabled. The application's
> primary data path still uses the owner connection (`prisma.tenant`, the app-layer
> guard). `runWithOrgScope` is the RLS-enforced path, used today by the
> `rls-status` self-check and available for security-sensitive queries; migrating
> the whole request path onto per-transaction GUC binding is a deliberate,
> performance-sensitive follow-on. The exit criterion — *RLS blocks cross-tenant
> access even if the app guard is bypassed* — is satisfied and verified at the DB
> layer regardless of app adoption.

### Verification (performed)

Connecting directly as `ovozai_app` (raw psql — **no application code in the
path**), with two orgs each owning one customer:

- org-A context (`SET app.current_org='…A'`) → sees **only** org-A's row;
- org-B context → sees **only** org-B's row;
- no context (`RESET`) → **0 rows** (fail-closed);
- inserting a row for a different org → **rejected** by `WITH CHECK`.

The same isolation is confirmed through the application via
`GET /api/v1/compliance/rls-status` (own org visible, a foreign-org context sees 0)
in the Phase-7 live smoke.

---

## 2. Uzbekistan data residency (Law No. ZRU-547)

**Requirement.** Personal data of Uzbek citizens (call recordings, transcripts,
customer records) must be stored on infrastructure located in Uzbekistan.

**What the code provides (◐).**
- A single, well-known inventory of PII-bearing stores: PostgreSQL (customers,
  transcripts, calls) and the object store (recordings, via
  `@ovozai/integrations` `StorageProvider`). No PII is written anywhere else.
- `DATA_REGION` (default `uz`) is surfaced on `GET /metrics`
  (`ovozai_build_info{data_region="uz"}`) so the deployed region is auditable.
- The storage and database layers are provider-agnostic, so pointing them at
  in-country infrastructure is pure configuration (`DATABASE_URL`,
  `STORAGE_PROVIDER`/`STORAGE_S3_*`).

**Boundary (⬚).** Actually placing PostgreSQL and the object store on
Uzbekistan-resident infrastructure, and contracting an in-country region/provider,
is a deployment decision not exercisable in this environment. Residency must be
asserted at deploy time and evidenced by the provider's region attestation.

---

## 3. Data retention & right-to-erasure

Implemented in `apps/api/src/compliance/` (API) and
`apps/jobs-worker/src/retention-sweep-processor.ts` (sweep).

### Retention policy (per organization)

`Organization.recordingRetentionDays` / `transcriptRetentionDays` (nullable;
`null` = retain indefinitely). Managed by the OWNER:

- `GET /api/v1/compliance/retention` — current policy.
- `PUT /api/v1/compliance/retention` — set either window.

### Retention sweep (async)

- `POST /api/v1/compliance/retention/sweep` (OWNER) enqueues a `retention` BullMQ
  job; the jobs-worker runs `processRetentionSweepJob`, which **deletes recording
  objects and transcript content older than the policy** (recordings and
  transcripts have independent windows) while **retaining the call ledger row**
  (billing integrity) with its content purged. Idempotent; schedule it from cron in
  production (e.g. daily).

### Right-to-erasure (synchronous)

- `POST /api/v1/compliance/erasure` (OWNER) `{ customerId, reason? }` erases one
  data subject: deletes their transcripts + transcript turns, deletes their call
  recordings, strips PII from the retained call ledger rows (`fromE164`,
  `recordingObjectKey`, `customerId` → null), and anonymizes the customer record
  (name/email/notes cleared, phone replaced with a non-identifying `erased:<id>`
  token, `deletedAt` set). The action is written to the **audit log**
  (`customer.erased`) with the removed-item counts.

### Verification (performed)

The Phase-7 live smoke seeds a call + transcript (2 turns) + a recording file for a
customer, then:
- erasure removes the recording file, both transcript turns, the transcript, strips
  the call PII, anonymizes the customer, and writes the audit row;
- a retention sweep (policy = 1 day) over a 3-day-old call purges its transcript and
  deletes its recording file via the queue → worker, keeping the ledger row.

---

## 4. PII handling & log redaction

Voice-receptionist logs can incidentally contain caller phone numbers, emails, and
credentials. `apps/api/src/common/redaction.ts` provides `redactString` /
`redactPii` (deep, cycle-safe, bounded depth) that mask emails, phone numbers, and
opaque tokens (API keys, JWTs), and blank out sensitive keys
(`password`, `token*`, `secret`, `authorization`, …) wholesale.

The structured logger (`structured-logger.ts`) applies redaction to every line.
Secrets are never logged by design (argon2id hashes, hashed refresh tokens, HMAC
secrets stored encrypted/recoverable only where required — see
[`SECURITY.md`](./SECURITY.md)). Unit tests cover redaction, including the
UUID/long-id false-positive guard.

---

## 5. Observability

### Implemented (✅)

- **Metrics** — `GET /api/v1/metrics` (Prometheus text exposition, no external
  dependency): HTTP request counters by method/route/status, a latency histogram,
  process gauges (uptime, RSS, heap), `ovozai_build_info{version,data_region}`, and
  **BullMQ queue-depth gauges** (`ovozai_queue_jobs{queue,state}`) for the
  embedding / webhook / usage-rollup / retention queues. Toggle with
  `METRICS_ENABLED`.
- **Structured logs** — `LOG_FORMAT=json` (default in production) emits one JSON
  object per line with timestamp, level, context, and the **per-request
  correlation id** (`requestId`, carried across async boundaries via
  `AsyncLocalStorage`, and echoed on the `X-Request-Id` response header). All lines
  are PII-redacted.
- **Health** — liveness (`/health`, always 200) + readiness (`/health/ready`,
  checks PostgreSQL + Redis), from Phase 1.

### Boundary (⬚)

- **Distributed tracing** (OpenTelemetry spans across api → voice-worker →
  jobs-worker) needs a collector/backend (Tempo/Jaeger/vendor) and is not wired
  here. The correlation id is the seam: propagate `X-Request-Id` as the trace id
  and add an OTel SDK + exporter at deploy time.
- **Voice-path latency SLOs.** Targets (p95 end-of-speech → start-of-audio ≤ 1.5 s;
  STT/LLM/TTS stage budgets) are defined in [`VOICE_PIPELINE.md`](./VOICE_PIPELINE.md).
  The call pipeline records per-stage timings; exporting them as histograms and
  alerting on the SLO is a monitoring-stack deployment task.

---

## 6. Load & scale testing

A dependency-free load harness ships at
[`infrastructure/loadtest/loadtest.mjs`](../infrastructure/loadtest/loadtest.mjs):
it drives a target endpoint at a chosen concurrency for a duration and reports
throughput and latency percentiles (p50/p90/p95/p99). Example:

```bash
node infrastructure/loadtest/loadtest.mjs --url http://localhost:3001/api/v1/health \
  --concurrency 50 --duration 20
```

**Boundary (⬚).** Establishing documented capacity and autoscaling behaviour for
each tier **at target concurrency** — the voice-worker pool under N concurrent
calls, api/jobs-worker throughput — requires a staging environment with real
provider infra (LiveKit media, SIP, STT/LLM/TTS) and horizontal scaling, which is
not available locally. The harness is the tool; the numbers are produced against a
real deployment and recorded here when available.

---

## 7. Security audit & SOC2-style controls

### Dependency audit (✅, performed)

`pnpm audit` (prod and dev): **no known vulnerabilities**. Versions are pinned
deliberately (TypeScript 5.9, Prisma 7.10 — see [`CLAUDE.md`](../CLAUDE.md)); run
`pnpm audit` in CI and on every dependency change.

### AuthN/Z & tenancy review (✅, in place)

Argon2id passwords; short-lived access JWT + rotating refresh with reuse detection;
deny-by-default RBAC guards; the Phase-2 tenant extension; and now **RLS** (§1) as
the database-level backstop. Internal channel is service-token + HMAC over the raw
body. Secrets are never committed (`.env` is git-ignored; `.env.example` documents
every variable).

### Penetration test (⬚)

An external penetration test against a running deployment is out of scope for a
local build. Prerequisites are met: a documented threat model
([`SECURITY.md`](./SECURITY.md)), RBAC + RLS, RFC 9457 error contracts, helmet +
CORS, and audit logging.

### SOC2-style controls (◐ / ⬚)

| Control family | What exists | What's a deployment/process boundary |
| --- | --- | --- |
| Access management | RBAC (OWNER/ADMIN/MEMBER/VIEWER), membership lifecycle, API keys | Periodic access reviews (process + evidence) |
| Change management | Git history, migrations, CI gates (build/typecheck/lint/test) | PR approvals, release sign-off records |
| Logging & monitoring | Structured, redacted, correlated logs; metrics; audit log | Centralized retention in a SIEM; alerting |
| Data protection | RLS, retention, erasure, PII redaction, consent capture (Phase 5) | In-country residency attestation (§2) |
| Audit trail | Append-only `audit_logs` (login, role change, key creation, erasure, retention changes) | Tamper-evident archival / retention evidence |

SOC2 is an **evidence-collection program over time**, not a code artifact: the
controls above are the technical substrate; the audit is conducted against a
running, operated system.

---

## Environment variables (Phase 7)

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_APP_URL` | *(unset)* | RLS-enforced connection (`ovozai_app`). Unset → owner connection (RLS no-op); app-layer guard primary. |
| `LOG_FORMAT` | `json` in prod, else `pretty` | `json` emits structured, redacted log lines. |
| `METRICS_ENABLED` | `true` | Expose `GET /api/v1/metrics`. |
| `DATA_REGION` | `uz` | Declared residency region (surfaced on `/metrics`). |

Retention windows are per-organization data (`PUT /compliance/retention`), not env.
