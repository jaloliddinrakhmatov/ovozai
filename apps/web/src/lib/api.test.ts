import { afterEach, describe, expect, it, vi } from "vitest";
import type { LivenessResponse } from "@ovozai/contracts";
import { fetchLiveness, getApiBaseUrl, livenessUrl } from "./api";

const VALID_LIVENESS: LivenessResponse = {
  status: "ok",
  service: "api",
  version: "0.1.0",
  uptimeSec: 42,
  timestamp: new Date("2026-01-01T00:00:00.000Z").toISOString(),
};

/** Build a minimal Response-like object for a stubbed `fetch`. */
function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("livenessUrl", () => {
  it("points at the liveness health route", () => {
    expect(livenessUrl()).toBe(`${getApiBaseUrl()}/api/v1/health`);
    expect(livenessUrl().endsWith("/api/v1/health")).toBe(true);
  });
});

describe("fetchLiveness", () => {
  it("returns the parsed payload on a valid response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(VALID_LIVENESS));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchLiveness();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(livenessUrl(), expect.any(Object));
    expect(result.status).toBe("ok");
    expect(result.version).toBe("0.1.0");
  });

  it("rejects when the response body is invalid", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ status: "nope", service: 123 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchLiveness()).rejects.toThrow();
  });

  it("rejects when the response is not OK", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(VALID_LIVENESS, false, 503));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchLiveness()).rejects.toThrow(/503/);
  });
});
