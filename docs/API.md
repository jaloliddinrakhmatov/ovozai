# OvozAI — API Reference & Conventions

> The HTTP contract for the OvozAI platform API (`apps/api`, NestJS 12 modular
> monolith).
>
> **Status:** Conventions and target surface. Only the health endpoints exist in
> Phase 1 — everything else is marked **planned / later phase**.
> **Last updated:** 2026-10-21

Related documents:

- [docs/ARCHITECTURE.md](./ARCHITECTURE.md) — services, modules, request flow.
- [docs/DATABASE.md](./DATABASE.md) — the data model these endpoints read/write.
- [docs/VOICE_PIPELINE.md](./VOICE_PIPELINE.md) — the voice worker that calls the internal API.
- [docs/SECURITY.md](./SECURITY.md) — token issuance, secret handling, HMAC signing.
- [docs/ROADMAP.md](./ROADMAP.md) — phase plan referenced by the endpoint catalog.

---

## 1. Style & Conventions

| Aspect | Convention |
| --- | --- |
| Transport | **REST over HTTPS** only. HTTP is redirected/refused. |
| Base path | **`/api/v1`** (public API). Internal: `/internal/v1` (see §13). |
| Payloads | **JSON** (`application/json; charset=utf-8`). |
| Field casing | **camelCase** in all request and response bodies. |
| Timestamps | **ISO-8601** / RFC 3339, UTC with `Z` (e.g. `2026-10-21T09:30:00Z`). |
| Identifiers | **UUID** (v7) strings for all resource ids. |
| Money | Integer **minor units** + ISO-4217 `currency` (mirrors DB — see DATABASE.md §5.7). |
| Enums | SCREAMING_SNAKE_CASE string values matching the DB enums. |
| HTTP methods | `GET` (read), `POST` (create/action), `PATCH` (partial update), `PUT` (replace, rare), `DELETE` (soft delete). |
| Empty bodies | `204 No Content` for successful deletes with nothing to return. |

The API is a **modular monolith**: each resource group below is a NestJS module,
but all share one deployable (`apps/api`) and one database
(`@ovozai/database`).

---

## 2. Authentication & Authorization

### 2.1 Principals

Two kinds of principal authenticate to the public API:

1. **Users** — interactive clients (`apps/web`, Next.js 16) use **JWT bearer**
   tokens.
2. **Server-to-server** — machine clients use an **API key**.

### 2.2 JWT bearer (users)

- **Short-lived access token** (`Authorization: Bearer <jwt>`), ~15 min TTL.
- **Rotating refresh token**, exchanged at `POST /api/v1/auth/refresh`; each
  refresh issues a new refresh token and invalidates the prior one (reuse
  detection → full session revocation).
- The access token's claims include `sub` (user id) and **`org`** — the
  **active-organization** claim. This is the tenant for the request.

```http
GET /api/v1/agents HTTP/1.1
Host: api.ovozai.uz
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6...
```

### 2.3 API keys (server-to-server)

- Sent as **`X-Api-Key: ovz_live_<prefix>.<secret>`**.
- Only a hash + prefix are stored (DATABASE.md → `ApiKey`); keys carry `scopes`
  and are bound to a single organization.

```http
GET /api/v1/calls HTTP/1.1
Host: api.ovozai.uz
X-Api-Key: ovz_live_a1b2c3.9f8e7d6c5b4a39281706...
```

### 2.4 Organization scoping

- The tenant is the **active-organization** from the token/key — resolved and
  **verified against `Membership`** on every request (DATABASE.md §3.1).
- A client **may** send **`X-Organization-Id: <uuid>`**. If present it **must
  match** the principal's active org (and an existing membership); a mismatch is
  rejected with `403` (`forbidden_org_mismatch`). It is a guard, not a selector.
- Switching the active org for a user session is an explicit auth operation
  (`POST /api/v1/auth/switch-org`), which re-issues tokens.

### 2.5 RBAC

Roles (`OWNER`, `ADMIN`, `MEMBER`, `VIEWER`; future `AGENT_OPERATOR`) live on
`Membership` and are enforced by **NestJS guards** per endpoint. Each endpoint in
the catalog (§11) lists its **minimum required role**. The role hierarchy is
`OWNER ⊇ ADMIN ⊇ MEMBER ⊇ VIEWER` for read access; mutating operations state
their own floor.

---

## 3. Error Model (RFC 9457 problem+json)

All errors use **`application/problem+json`** per **RFC 9457**. Fields:

| Field | Meaning |
| --- | --- |
| `type` | URI identifying the problem type (dereferenceable docs page). |
| `title` | Short, human-readable summary (stable per `type`). |
| `status` | HTTP status code (duplicated in body for convenience). |
| `detail` | Human-readable explanation specific to this occurrence. |
| `instance` | URI/path of the specific request occurrence. |
| `code` | **Extension:** stable machine-readable error code (see §4). |
| `errors[]` | **Extension:** field-level validation errors (when applicable). |
| `requestId` | **Extension:** echoes `X-Request-Id` for support correlation. |

Example validation error:

```json
{
  "type": "https://docs.ovozai.uz/errors/validation-failed",
  "title": "Validation failed",
  "status": 422,
  "detail": "The request body failed schema validation.",
  "instance": "/api/v1/agents",
  "code": "validation_failed",
  "requestId": "req_01JAX8Z3K9M2Q7V4N6RBTD5P1W",
  "errors": [
    { "path": "name", "code": "too_small", "message": "String must contain at least 1 character(s)" },
    { "path": "defaultLanguage", "code": "invalid_enum_value", "message": "Expected 'UZ' | 'RU' | 'EN'" }
  ]
}
```

Example auth error:

```json
{
  "type": "https://docs.ovozai.uz/errors/unauthorized",
  "title": "Unauthorized",
  "status": 401,
  "detail": "Access token is missing or expired.",
  "instance": "/api/v1/agents",
  "code": "unauthorized",
  "requestId": "req_01JAX8ZB2C4D6F8H0K2M4P6R8T"
}
```

---

## 4. Error-Code Catalog

`code` is stable across versions; clients branch on it rather than on `title`.

| `code` | HTTP | Meaning |
| --- | --- | --- |
| `unauthorized` | 401 | Missing/invalid/expired credentials. |
| `invalid_token` | 401 | Malformed or revoked JWT. |
| `forbidden` | 403 | Authenticated but lacking the required role/scope. |
| `forbidden_org_mismatch` | 403 | `X-Organization-Id` does not match the principal's active org. |
| `not_found` | 404 | Resource does not exist (or is not visible to this tenant). |
| `method_not_allowed` | 405 | HTTP method not supported on this path. |
| `conflict` | 409 | State conflict (e.g. duplicate `slug`, version race). |
| `idempotency_key_reuse` | 409 | `Idempotency-Key` reused with a different payload. |
| `unprocessable_entity` | 422 | Semantically invalid despite well-formed JSON. |
| `validation_failed` | 422 | Schema (zod) validation failed; see `errors[]`. |
| `rate_limited` | 429 | Rate limit exceeded; see `Retry-After`. |
| `payload_too_large` | 413 | Body exceeds the configured limit. |
| `unsupported_media_type` | 415 | `Content-Type` not `application/json`. |
| `dependency_unavailable` | 503 | A required dependency (DB/Redis) is down. |
| `internal_error` | 500 | Unexpected server fault (opaque; `requestId` for support). |

---

## 5. Pagination

List endpoints use **cursor-based** pagination.

- Request: `?limit=<1..100, default 20>&cursor=<opaque>`.
- Response envelope:

```json
{
  "data": [ { "id": "...", "...": "..." } ],
  "pageInfo": {
    "nextCursor": "eyJpZCI6IjAxSkFYOFoifQ",
    "hasNextPage": true
  }
}
```

- `cursor` is opaque (base64url of the sort key + id); clients must not parse it.
- When `hasNextPage` is `false`, `nextCursor` is `null`.
- Cursor pagination is stable under inserts and avoids deep-offset cost.

### 5.1 Sorting

- `?sort=<field>` with `-` prefix for descending (e.g. `?sort=-createdAt`).
- Only whitelisted fields per resource are sortable; the cursor encodes the
  active sort so pages remain consistent.

### 5.2 Filtering

- Equality filters as query params: `?status=ACTIVE&direction=INBOUND`.
- Ranges use suffixes: `?startedAt[gte]=2026-10-01T00:00:00Z&startedAt[lt]=2026-11-01T00:00:00Z`.
- Free-text search where supported: `?q=<term>`.
- Unknown/non-whitelisted filter keys → `422 validation_failed`.

---

## 6. Idempotency, Request IDs & Rate Limiting

### 6.1 Idempotency

- Mutating `POST` endpoints that create resources or trigger side effects accept
  **`Idempotency-Key: <client-generated uuid>`**.
- The first request with a key is processed and its response cached (keyed by
  org + endpoint + key + payload hash). A **retry with the same key and same
  payload** returns the original response. A **same key with a different
  payload** → `409 idempotency_key_reuse`.
- Keys are retained for 24h.

### 6.2 Request IDs

- Clients may send **`X-Request-Id`**; otherwise the API generates one. It is
  echoed on every response header and in the problem+json `requestId` field, and
  threaded through logs and the internal/voice path for tracing.

### 6.3 Rate limiting

- Limits are per principal (user or API key) and per org. On exceed:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 12
RateLimit-Limit: 600
RateLimit-Remaining: 0
RateLimit-Reset: 12
Content-Type: application/problem+json
```

- `RateLimit-*` headers (draft IETF semantics) accompany normal responses too, so
  clients can self-throttle. Counters are backed by Redis 7.

---

## 7. Validation

- Request/response shapes are defined once as **zod 4.6** schemas in
  **`packages/contracts`** and shared across `apps/web`, `apps/api`, and the
  workers. One schema, one source of truth.
- The API applies a **NestJS `ZodValidationPipe`** that parses the body/query/
  params against the contract schema. Failures become the `validation_failed`
  problem+json with per-field `errors[]` (§3).
- Because clients import the same contracts, request construction and response
  parsing are type-checked at compile time, and server and client never drift.

---

## 8. Versioning & Deprecation

- The major version is in the path: **`/api/v1`**. Breaking changes ship under a
  new major (`/api/v2`) and run in parallel during a migration window.
- Additive, backward-compatible changes (new optional fields, new endpoints) do
  **not** bump the version.
- **Deprecation policy:** a deprecated endpoint/field returns a **`Deprecation`**
  header (date) and a **`Sunset`** header (removal date), plus a `Link` to
  migration docs. Minimum **90 days** between `Sunset` announcement and removal.
- Deprecations are also announced in [docs/ROADMAP.md](./ROADMAP.md) and the
  changelog.

---

## 9. OpenAPI / Swagger

- An **OpenAPI 3.1** document is generated from the NestJS decorators + contract
  schemas.
- **Swagger UI** is served at **`/api/docs`** and the raw spec at
  `/api/docs-json` — **in non-production environments only**. In production the
  docs routes are disabled; the spec is published through the docs site instead.

---

## 10. Phase-1 Endpoints (implemented)

Phase 1 ships **only** the health endpoints (plus the app skeleton and Prisma
wiring). These are unauthenticated and not tenant-scoped.

### 10.1 `GET /api/v1/health` — liveness

Always returns **`200`** while the process is up. It does **not** touch
dependencies; it only proves the HTTP server is alive.

```http
GET /api/v1/health HTTP/1.1
Host: api.ovozai.uz
```

```json
{
  "status": "ok",
  "uptime": 32451.87,
  "version": "0.1.0",
  "timestamp": "2026-10-21T09:30:00Z"
}
```

- `uptime` is process uptime in seconds.
- `version` is the deployed build version (from package metadata / CI).

### 10.2 `GET /api/v1/health/ready` — readiness

Checks required dependencies (**PostgreSQL 16** and **Redis 7**) using
**`@nestjs/terminus`**. Returns **`200`** when all checks pass, **`503`** when any
dependency is unhealthy, with per-check detail. Load balancers and orchestrators
gate traffic on this endpoint.

Healthy (`200`):

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" }
  },
  "error": {},
  "details": {
    "database": { "status": "up" },
    "redis": { "status": "up" }
  }
}
```

Degraded (`503`, Redis down):

```http
HTTP/1.1 503 Service Unavailable
Content-Type: application/json
```

```json
{
  "status": "error",
  "info": {
    "database": { "status": "up" }
  },
  "error": {
    "redis": { "status": "down", "message": "Connection timed out after 2000ms" }
  },
  "details": {
    "database": { "status": "up" },
    "redis": { "status": "down", "message": "Connection timed out after 2000ms" }
  }
}
```

The readiness body follows the Terminus shape (`info` = passing, `error` =
failing, `details` = both). This is the one place the API deviates from
problem+json, by design, to stay compatible with standard health tooling.

---

## 11. Target Endpoint Catalog (planned / later phase)

> Everything in this section is **planned**. None of it exists in Phase 1. Routes,
> shapes, and roles are the intended contract and are subject to refinement as
> each module lands per [docs/ROADMAP.md](./ROADMAP.md). All routes are under
> `/api/v1`, require authentication, and are tenant-scoped unless noted.

### 11.1 Auth (`/auth`)

| Method & Path | Purpose | Required role |
| --- | --- | --- |
| `POST /auth/login` | Exchange credentials for access + refresh tokens. | public |
| `POST /auth/refresh` | Rotate refresh token, issue new access token. | public (valid refresh) |
| `POST /auth/logout` | Revoke the current refresh token/session. | authenticated |
| `POST /auth/switch-org` | Re-issue tokens with a different active org. | member of target org |
| `GET /auth/me` | Current user + memberships + active org. | authenticated |

### 11.2 Organizations (`/organizations`)

| Method & Path | Purpose | Required role |
| --- | --- | --- |
| `POST /organizations` | Create a new organization (registration). | authenticated |
| `GET /organizations/current` | Fetch the active organization. | VIEWER |
| `PATCH /organizations/current` | Update name, locale defaults, settings. | ADMIN |
| `DELETE /organizations/current` | Soft-delete / begin tenant offboarding. | OWNER |

### 11.3 Memberships & invites (`/memberships`)

| Method & Path | Purpose | Required role |
| --- | --- | --- |
| `GET /memberships` | List members of the active org. | MEMBER |
| `POST /memberships/invites` | Invite a user by email with a role. | ADMIN |
| `POST /memberships/invites/:token/accept` | Accept an invite. | authenticated invitee |
| `PATCH /memberships/:id` | Change a member's role. | ADMIN (OWNER to set OWNER) |
| `DELETE /memberships/:id` | Remove a member. | ADMIN |

### 11.4 API keys (`/api-keys`)

| Method & Path | Purpose | Required role |
| --- | --- | --- |
| `GET /api-keys` | List keys (prefix + metadata only). | ADMIN |
| `POST /api-keys` | Create a key (raw secret returned once). | ADMIN |
| `DELETE /api-keys/:id` | Revoke a key. | ADMIN |

### 11.5 Agents (`/agents`)

| Method & Path | Purpose | Required role |
| --- | --- | --- |
| `GET /agents` | List agents. | VIEWER |
| `POST /agents` | Create an agent. | ADMIN |
| `GET /agents/:id` | Get one agent. | VIEWER |
| `PATCH /agents/:id` | Update config/prompt/voice/greeting. | ADMIN |
| `DELETE /agents/:id` | Soft-delete an agent. | ADMIN |
| `POST /agents/:id/publish` | Snapshot config into a new `AgentVersion`. | ADMIN |
| `GET /agents/:id/versions` | List published versions. | VIEWER |

### 11.6 Knowledge base (`/knowledge-bases`)

| Method & Path | Purpose | Required role |
| --- | --- | --- |
| `GET /knowledge-bases` | List knowledge bases. | VIEWER |
| `POST /knowledge-bases` | Create a knowledge base. | MEMBER |
| `GET /knowledge-bases/:id/documents` | List documents. | VIEWER |
| `POST /knowledge-bases/:id/documents` | Add a document (upload/url/text). | MEMBER |
| `GET /knowledge-bases/:id/documents/:docId` | Get a document + status. | VIEWER |
| `DELETE /knowledge-bases/:id/documents/:docId` | Remove a document. | MEMBER |

### 11.7 Customers (`/customers`)

| Method & Path | Purpose | Required role |
| --- | --- | --- |
| `GET /customers` | List/search customers (`?q=`, `?phoneE164=`). | VIEWER |
| `POST /customers` | Create a customer. | MEMBER |
| `GET /customers/:id` | Get a customer. | VIEWER |
| `PATCH /customers/:id` | Update details/tags/notes. | MEMBER |
| `DELETE /customers/:id` | Soft-delete a customer. | ADMIN |

### 11.8 Appointments (`/appointments`)

| Method & Path | Purpose | Required role |
| --- | --- | --- |
| `GET /appointments` | List (filter by date range, status, customer). | VIEWER |
| `POST /appointments` | Create a booking. | MEMBER |
| `GET /appointments/:id` | Get an appointment. | VIEWER |
| `PATCH /appointments/:id` | Reschedule / change status. | MEMBER |
| `DELETE /appointments/:id` | Cancel an appointment. | MEMBER |

### 11.9 Calls (`/calls`)

| Method & Path | Purpose | Required role |
| --- | --- | --- |
| `GET /calls` | List calls (filter by status/direction/date/agent). | VIEWER |
| `GET /calls/:id` | Get a call with its metadata. | VIEWER |
| `GET /calls/:id/events` | List lifecycle events. | VIEWER |
| `GET /calls/:id/transcript` | Get the transcript + turns. | VIEWER |
| `GET /calls/:id/recording` | Signed URL to the recording (audited). | ADMIN |

### 11.10 Phone numbers (`/phone-numbers`)

| Method & Path | Purpose | Required role |
| --- | --- | --- |
| `GET /phone-numbers` | List provisioned numbers. | VIEWER |
| `POST /phone-numbers` | Provision / import a number. | ADMIN |
| `PATCH /phone-numbers/:id` | Route to an agent / change status. | ADMIN |
| `DELETE /phone-numbers/:id` | Release a number. | ADMIN |

### 11.11 Billing (`/billing`)

| Method & Path | Purpose | Required role |
| --- | --- | --- |
| `GET /billing/plans` | List available plans. | VIEWER |
| `GET /billing/subscription` | Current subscription + status. | ADMIN |
| `POST /billing/subscription` | Subscribe / change plan. | OWNER |
| `GET /billing/usage` | Metered usage for the current period. | ADMIN |

### 11.12 Integrations (`/integrations`)

| Method & Path | Purpose | Required role |
| --- | --- | --- |
| `GET /integrations` | List configured integrations. | ADMIN |
| `POST /integrations` | Connect an integration (calendar/crm/…). | ADMIN |
| `DELETE /integrations/:id` | Disconnect an integration. | ADMIN |

### 11.13 Webhooks (`/webhooks`)

| Method & Path | Purpose | Required role |
| --- | --- | --- |
| `GET /webhooks/endpoints` | List endpoints. | ADMIN |
| `POST /webhooks/endpoints` | Register an endpoint + subscribe to events. | ADMIN |
| `PATCH /webhooks/endpoints/:id` | Update URL/events/status. | ADMIN |
| `DELETE /webhooks/endpoints/:id` | Remove an endpoint. | ADMIN |
| `GET /webhooks/deliveries` | List delivery attempts. | ADMIN |
| `POST /webhooks/deliveries/:id/retry` | Re-attempt a failed delivery. | ADMIN |

---

## 12. Internal API (voice worker → backend) — Phase 4

`apps/voice-worker` (the LiveKit agent) reports call lifecycle and transcript data
to the backend over a **separate, internal surface** under **`/internal/v1`**.
This is **Phase 4** and is not part of the public `/api/v1` contract.

- **Not** exposed to tenants; reachable only within the private network.
- Authenticated with a **service token** and additionally an **HMAC** signature
  over the request body (replay-protected with a timestamp + nonce). See
  [docs/SECURITY.md](./SECURITY.md) for key management and
  [docs/VOICE_PIPELINE.md](./VOICE_PIPELINE.md) for the producer side.
- The organization/tenant is derived from the referenced `Call`, not from a user
  token.

Representative internal endpoints:

| Method & Path | Purpose |
| --- | --- |
| `POST /internal/v1/calls/:id/events` | Append a `CallEvent` (ringing/answered/tool/transfer/hangup). |
| `POST /internal/v1/calls/:id/transcript` | Upsert the `Transcript` / append `TranscriptTurn`s. |
| `PATCH /internal/v1/calls/:id` | Update call status, timing, duration, recording key, cost. |
| `POST /internal/v1/calls/:id/usage` | Report `UsageRecord`s (STT seconds, TTS chars, LLM tokens). |

Example (service-to-service, signed):

```http
POST /internal/v1/calls/01JAX8Z.../events HTTP/1.1
Host: api.internal.ovozai
Content-Type: application/json
X-Service-Token: svc_voice_worker_...
OvozAI-Signature: t=1792963800,v1=5f1e...c9
X-Request-Id: req_01JAX8ZC3D5F7H9K1M3P5R7T9V

{ "type": "answered", "payload": { "answeredAt": "2026-10-21T09:30:04Z" }, "occurredAt": "2026-10-21T09:30:04Z" }
```

---

## 13. Webhooks (outbound)

The platform delivers signed event notifications to tenant-registered
`WebhookEndpoint`s (DATABASE.md → `WebhookEndpoint` / `WebhookDelivery`).

- Each delivery is **signed with HMAC-SHA256** using the endpoint's `secret`.
- The signature is carried in the **`OvozAI-Signature`** header as
  `t=<unix-ts>,v1=<hex-hmac>`, computed over `"<t>.<raw-body>"`. Receivers
  recompute and compare in constant time, and reject stale timestamps to prevent
  replay.
- Delivery, retry with exponential backoff, and dead-lettering are handled by
  `apps/jobs-worker` (BullMQ). Each attempt is recorded as a `WebhookDelivery`.
- Representative event types: `call.completed`, `call.transferred`,
  `appointment.created`, `appointment.canceled`, `transcript.ready`.

Example delivered request:

```http
POST /hooks/ovozai HTTP/1.1
Host: customer.example.uz
Content-Type: application/json
OvozAI-Signature: t=1792963905,v1=9b2c4e6a8d0f...c1
OvozAI-Event: call.completed
X-Request-Id: req_01JAX8ZD4E6G8J0L2N4Q6S8U0W

{
  "id": "evt_01JAX8ZD...",
  "type": "call.completed",
  "createdAt": "2026-10-21T09:31:45Z",
  "data": {
    "callId": "01JAX8Z...",
    "status": "COMPLETED",
    "durationSec": 96,
    "language": "UZ"
  }
}
```

Receivers should respond `2xx` quickly; non-2xx or timeout triggers retry.
