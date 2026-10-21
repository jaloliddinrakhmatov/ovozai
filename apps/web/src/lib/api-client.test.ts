import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiError, setAuthClearedHandler } from "./api-client";
import { clearTokens, getAccessToken, setTokens } from "./token-store";

interface FetchCall {
  url: string;
  init: RequestInit & { headers: Record<string, string> };
}

/** Minimal `Response` stand-in supporting `.json()` and `.text()`. */
function makeResponse(status: number, body?: unknown): Response {
  const ok = status >= 200 && status < 300;
  const text = body === undefined ? "" : JSON.stringify(body);
  return {
    status,
    ok,
    json: async () => body,
    text: async () => text,
  } as unknown as Response;
}

function lastCalls(mock: ReturnType<typeof vi.fn>): FetchCall[] {
  return mock.mock.calls.map((call) => ({
    url: String(call[0]),
    init: (call[1] ?? {}) as FetchCall["init"],
  }));
}

const NEW_TOKENS = {
  tokenType: "Bearer" as const,
  accessToken: "new-access",
  refreshToken: "new-refresh",
  expiresIn: 900,
};

beforeEach(() => {
  clearTokens();
  setAuthClearedHandler(null);
});

afterEach(() => {
  clearTokens();
  setAuthClearedHandler(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("apiFetch — happy path", () => {
  it("attaches the bearer token and returns the parsed body", async () => {
    setTokens({ accessToken: "tok", refreshToken: "r" });
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, { hello: "world" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch("/api/v1/auth/me");

    expect(result).toEqual({ hello: "world" });
    const [call] = lastCalls(fetchMock);
    expect(call?.init.headers.Authorization).toBe("Bearer tok");
  });

  it("omits the bearer token for unauthenticated requests", async () => {
    setTokens({ accessToken: "tok", refreshToken: "r" });
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/v1/auth/login", { method: "POST", body: {}, auth: false });

    const [call] = lastCalls(fetchMock);
    expect(call?.init.headers.Authorization).toBeUndefined();
    expect(call?.init.headers["Content-Type"]).toBe("application/json");
  });

  it("returns undefined for a 204 response", async () => {
    setTokens({ accessToken: "tok", refreshToken: "r" });
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(204));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/api/v1/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });
});

describe("apiFetch — refresh on 401", () => {
  it("refreshes once and retries the original request with the new token", async () => {
    setTokens({ accessToken: "old", refreshToken: "r1" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(401, { title: "Unauthorized", status: 401 }))
      .mockResolvedValueOnce(makeResponse(200, NEW_TOKENS))
      .mockResolvedValueOnce(makeResponse(200, { data: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch("/api/v1/auth/me");

    expect(result).toEqual({ data: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const calls = lastCalls(fetchMock);
    // Second call is the refresh, posting the stored refresh token.
    expect(calls[1]?.url).toContain("/api/v1/auth/refresh");
    expect(calls[1]?.init.method).toBe("POST");
    expect(String(calls[1]?.init.body)).toContain("r1");
    // Retry carries the refreshed access token.
    expect(calls[2]?.init.headers.Authorization).toBe("Bearer new-access");
    expect(getAccessToken()).toBe("new-access");
  });

  it("clears tokens and signals logout when the refresh fails", async () => {
    setTokens({ accessToken: "old", refreshToken: "r1" });
    const onCleared = vi.fn();
    setAuthClearedHandler(onCleared);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(401, { title: "Unauthorized", status: 401 }))
      .mockResolvedValueOnce(makeResponse(401, { title: "Invalid token", status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/api/v1/auth/me")).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onCleared).toHaveBeenCalledOnce();
    expect(getAccessToken()).toBeNull();
  });

  it("does not attempt a refresh when there is no refresh token", async () => {
    const onCleared = vi.fn();
    setAuthClearedHandler(onCleared);
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(401, { title: "Unauthorized", status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/api/v1/auth/me")).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onCleared).toHaveBeenCalledOnce();
  });
});

describe("apiFetch — problem+json errors", () => {
  it("parses field errors and the machine code from a 422 body", async () => {
    setTokens({ accessToken: "tok", refreshToken: "r" });
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse(422, {
        title: "Validation failed",
        status: 422,
        code: "validation_failed",
        errors: [{ path: "email", message: "Invalid email" }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const error = await apiFetch("/api/v1/auth/register", {
      method: "POST",
      body: {},
      auth: false,
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(422);
    expect(apiError.code).toBe("validation_failed");
    expect(apiError.fieldErrors.email).toBe("Invalid email");
    // A 422 is not a 401, so no refresh is attempted.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
