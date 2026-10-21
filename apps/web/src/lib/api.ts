import {
  HEALTH_ROUTES,
  livenessResponseSchema,
  type LivenessResponse,
} from "@ovozai/contracts";

/** Fallback used when `NEXT_PUBLIC_API_URL` is not set. */
const DEFAULT_API_BASE_URL = "http://localhost:3001";

/**
 * Resolve the API base URL from the public env var, trimming any trailing
 * slash so route concatenation never produces a double slash.
 */
export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_BASE_URL;
  return raw.replace(/\/+$/, "");
}

/** Absolute URL of the API liveness probe. */
export function livenessUrl(): string {
  return `${getApiBaseUrl()}${HEALTH_ROUTES.liveness}`;
}

/**
 * Fetch and validate the API liveness probe.
 *
 * @param signal - optional AbortSignal to cancel the in-flight request.
 * @returns the parsed, type-safe liveness payload.
 * @throws if the request fails, the response is not OK, the body is not JSON,
 *         or the body does not match {@link livenessResponseSchema}.
 */
export async function fetchLiveness(
  signal?: AbortSignal,
): Promise<LivenessResponse> {
  const response = await fetch(livenessUrl(), {
    signal,
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Liveness request failed with status ${response.status}`);
  }

  const body: unknown = await response.json();
  return livenessResponseSchema.parse(body);
}
