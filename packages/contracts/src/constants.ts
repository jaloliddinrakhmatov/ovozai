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
