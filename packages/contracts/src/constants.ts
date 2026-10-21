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
} as const;

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
} as const;
