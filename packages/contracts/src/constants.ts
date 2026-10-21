/** API version segment used in all public REST routes. */
export const API_VERSION = "v1" as const;

/** Base path for all public REST endpoints. */
export const API_BASE_PATH = `/api/${API_VERSION}` as const;

/** Canonical health-check routes, shared between the API and its clients. */
export const HEALTH_ROUTES = {
  /** Liveness: the process is up. Always 200 when reachable. */
  liveness: `${API_BASE_PATH}/health`,
  /** Readiness: dependencies (PostgreSQL, Redis) are reachable. */
  readiness: `${API_BASE_PATH}/health/ready`,
} as const;

/** Request/response header names shared across the API and its clients. */
export const HEADERS = {
  authorization: "authorization",
  apiKey: "x-api-key",
  organizationId: "x-organization-id",
  requestId: "x-request-id",
  /** Internal channel (voice-worker → api): service token + HMAC signature. */
  serviceToken: "x-service-token",
  signature: "ovozai-signature",
} as const;

/** Base path for the internal voice-worker ↔ API channel (not public). */
export const INTERNAL_BASE_PATH = "/internal/v1" as const;

/** Prefix of all issued API keys (`ovz_live_<prefix>.<secret>`). */
export const API_KEY_PREFIX = "ovz_live_" as const;

/**
 * Canonical route builders for the Phase 2 surface, shared with the web client
 * so routes are never hardcoded in two places. See docs/API.md §11.
 *
 * Note: `auth/register` is not in the API.md catalog but is required by the
 * sign-up flow (ROADMAP Phase 2); it is an additive, documented addition.
 */
export const API_ROUTES = {
  auth: {
    register: `${API_BASE_PATH}/auth/register`,
    login: `${API_BASE_PATH}/auth/login`,
    refresh: `${API_BASE_PATH}/auth/refresh`,
    logout: `${API_BASE_PATH}/auth/logout`,
    switchOrg: `${API_BASE_PATH}/auth/switch-org`,
    me: `${API_BASE_PATH}/auth/me`,
  },
  organizations: {
    root: `${API_BASE_PATH}/organizations`,
    current: `${API_BASE_PATH}/organizations/current`,
  },
  memberships: {
    root: `${API_BASE_PATH}/memberships`,
    invites: `${API_BASE_PATH}/memberships/invites`,
    acceptInvite: (token: string): string =>
      `${API_BASE_PATH}/memberships/invites/${token}/accept`,
    byId: (id: string): string => `${API_BASE_PATH}/memberships/${id}`,
  },
  apiKeys: {
    root: `${API_BASE_PATH}/api-keys`,
    byId: (id: string): string => `${API_BASE_PATH}/api-keys/${id}`,
  },
  agents: {
    root: `${API_BASE_PATH}/agents`,
    byId: (id: string): string => `${API_BASE_PATH}/agents/${id}`,
    publish: (id: string): string => `${API_BASE_PATH}/agents/${id}/publish`,
    versions: (id: string): string => `${API_BASE_PATH}/agents/${id}/versions`,
    restoreVersion: (id: string, version: number): string =>
      `${API_BASE_PATH}/agents/${id}/versions/${version}/restore`,
  },
  knowledgeBases: {
    root: `${API_BASE_PATH}/knowledge-bases`,
    byId: (id: string): string => `${API_BASE_PATH}/knowledge-bases/${id}`,
    documents: (id: string): string => `${API_BASE_PATH}/knowledge-bases/${id}/documents`,
    document: (id: string, docId: string): string =>
      `${API_BASE_PATH}/knowledge-bases/${id}/documents/${docId}`,
    query: (id: string): string => `${API_BASE_PATH}/knowledge-bases/${id}/query`,
  },
  customers: {
    root: `${API_BASE_PATH}/customers`,
    byId: (id: string): string => `${API_BASE_PATH}/customers/${id}`,
  },
  appointments: {
    root: `${API_BASE_PATH}/appointments`,
    byId: (id: string): string => `${API_BASE_PATH}/appointments/${id}`,
  },
  calls: {
    root: `${API_BASE_PATH}/calls`,
    byId: (id: string): string => `${API_BASE_PATH}/calls/${id}`,
    events: (id: string): string => `${API_BASE_PATH}/calls/${id}/events`,
    transcript: (id: string): string => `${API_BASE_PATH}/calls/${id}/transcript`,
    recording: (id: string): string => `${API_BASE_PATH}/calls/${id}/recording`,
  },
  phoneNumbers: {
    root: `${API_BASE_PATH}/phone-numbers`,
    byId: (id: string): string => `${API_BASE_PATH}/phone-numbers/${id}`,
  },
  webhooks: {
    endpoints: `${API_BASE_PATH}/webhooks/endpoints`,
    endpointById: (id: string): string => `${API_BASE_PATH}/webhooks/endpoints/${id}`,
    deliveries: `${API_BASE_PATH}/webhooks/deliveries`,
  },
  wer: {
    summary: `${API_BASE_PATH}/wer/summary`,
  },
  billing: {
    plans: `${API_BASE_PATH}/billing/plans`,
    subscription: `${API_BASE_PATH}/billing/subscription`,
    usage: `${API_BASE_PATH}/billing/usage`,
  },
  integrations: {
    root: `${API_BASE_PATH}/integrations`,
    byId: (id: string): string => `${API_BASE_PATH}/integrations/${id}`,
  },
  notifications: {
    root: `${API_BASE_PATH}/notifications`,
  },
} as const;

/** Internal voice-worker ↔ API routes (service-token + HMAC authenticated). */
export const INTERNAL_ROUTES = {
  createCall: `${INTERNAL_BASE_PATH}/calls`,
  events: (id: string): string => `${INTERNAL_BASE_PATH}/calls/${id}/events`,
  transcript: (id: string): string => `${INTERNAL_BASE_PATH}/calls/${id}/transcript`,
  update: (id: string): string => `${INTERNAL_BASE_PATH}/calls/${id}`,
  usage: (id: string): string => `${INTERNAL_BASE_PATH}/calls/${id}/usage`,
  toolKnowledgeRetrieval: (id: string): string =>
    `${INTERNAL_BASE_PATH}/calls/${id}/tools/knowledge-retrieval`,
  toolBookAppointment: (id: string): string =>
    `${INTERNAL_BASE_PATH}/calls/${id}/tools/book-appointment`,
  toolTransfer: (id: string): string => `${INTERNAL_BASE_PATH}/calls/${id}/tools/transfer`,
  recordWer: (id: string): string => `${INTERNAL_BASE_PATH}/calls/${id}/wer`,
} as const;
