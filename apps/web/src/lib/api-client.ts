import {
  API_ROUTES,
  authTokensSchema,
  problemDetailsSchema,
  type ProblemDetails,
} from "@ovozai/contracts";
import { getApiBaseUrl } from "./api";
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "./token-store";

/**
 * Error thrown by {@link apiFetch} for any non-2xx response. Carries the parsed
 * RFC 9457 problem+json body when the server returned one, so callers can
 * branch on the machine-readable `code` and surface `errors` per field.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly problem: ProblemDetails | null;
  readonly code: string | undefined;

  constructor(status: number, problem: ProblemDetails | null) {
    super(problem?.detail ?? problem?.title ?? `Request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
    this.code = problem?.code;
  }

  /** Field-level validation errors keyed by path, when the server sent them. */
  get fieldErrors(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const entry of this.problem?.errors ?? []) {
      result[entry.path] = entry.message;
    }
    return result;
  }
}

export interface ApiFetchOptions {
  method?: string;
  /** JSON-serializable request body. Sets `Content-Type: application/json`. */
  body?: unknown;
  /** Attach the bearer token and enable refresh-on-401. Defaults to `true`. */
  auth?: boolean;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

/**
 * Called when a 401 cannot be recovered (no refresh token, or refresh failed).
 * The auth context registers a handler here to reset itself to anonymous.
 */
type AuthClearedHandler = () => void;
let authClearedHandler: AuthClearedHandler | null = null;

export function setAuthClearedHandler(handler: AuthClearedHandler | null): void {
  authClearedHandler = handler;
}

function signalAuthCleared(): void {
  clearTokens();
  authClearedHandler?.();
}

async function rawFetch(
  path: string,
  options: ApiFetchOptions,
  accessToken: string | null,
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers,
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return fetch(`${getApiBaseUrl()}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
    cache: "no-store",
  });
}

// A single in-flight refresh is shared across concurrent 401s.
let refreshInFlight: Promise<boolean> | null = null;

function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function performRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const response = await rawFetch(
      API_ROUTES.auth.refresh,
      { method: "POST", body: { refreshToken }, auth: false },
      null,
    );
    if (!response.ok) return false;
    const body: unknown = await response.json();
    const tokens = authTokensSchema.parse(body);
    setTokens(tokens);
    return true;
  } catch {
    return false;
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  let problem: ProblemDetails | null = null;
  try {
    const text = await response.text();
    if (text) {
      const parsed = problemDetailsSchema.safeParse(JSON.parse(text));
      if (parsed.success) {
        problem = parsed.data;
      }
    }
  } catch {
    // Non-JSON or unreadable body: fall back to a status-only error.
  }
  return new ApiError(response.status, problem);
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  return JSON.parse(text) as unknown;
}

/**
 * Authenticated fetch wrapper. Attaches the bearer token, parses problem+json
 * errors into an {@link ApiError}, and on a `401` performs a single
 * `/auth/refresh` with the stored refresh token before retrying once. If the
 * refresh fails (or there is no refresh token) it clears tokens, signals
 * logout, and throws.
 *
 * @returns the parsed JSON body, or `undefined` for a `204`/empty response.
 */
export async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<unknown> {
  const requireAuth = options.auth ?? true;

  let response = await rawFetch(path, options, requireAuth ? getAccessToken() : null);

  if (response.status === 401 && requireAuth) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      const error = await toApiError(response);
      signalAuthCleared();
      throw error;
    }
    response = await rawFetch(path, options, getAccessToken());
    if (response.status === 401) {
      const error = await toApiError(response);
      signalAuthCleared();
      throw error;
    }
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  return parseBody(response);
}
