import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ErasureResult, RetentionPolicy, RlsStatus } from "@ovozai/contracts";
import {
  eraseCustomer,
  getRetentionPolicy,
  getRlsStatus,
  runRetentionSweep,
  updateRetentionPolicy,
} from "./compliance-api";
import { clearTokens, setTokens } from "./token-store";

interface FetchCall {
  url: string;
  init: RequestInit & { headers: Record<string, string> };
}

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

const RLS_STATUS: RlsStatus = {
  rlsEnforced: true,
  selfOrgVisibleCustomers: 7,
  foreignOrgVisibleCustomers: 0,
};

const RETENTION: RetentionPolicy = {
  recordingRetentionDays: 90,
  transcriptRetentionDays: null,
};

const ERASURE_RESULT: ErasureResult = {
  customerId: "44444444-4444-4444-8444-444444444444",
  anonymizedCustomer: true,
  redactedCalls: 3,
  deletedTranscripts: 3,
  deletedTranscriptTurns: 42,
  deletedRecordings: 2,
};

beforeEach(() => {
  clearTokens();
  setTokens({ accessToken: "tok", refreshToken: "r" });
});

afterEach(() => {
  clearTokens();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getRlsStatus", () => {
  it("parses the RLS self-check and sends an authenticated GET", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, RLS_STATUS));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getRlsStatus();

    expect(result.rlsEnforced).toBe(true);
    expect(result.foreignOrgVisibleCustomers).toBe(0);

    const [call] = lastCalls(fetchMock);
    expect(call?.url).toContain("/api/v1/compliance/rls-status");
    expect(call?.init.method ?? "GET").toBe("GET");
    expect(call?.init.headers.Authorization).toBe("Bearer tok");
  });

  it("rejects when the payload is not a valid RLS status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, { rlsEnforced: "yes" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getRlsStatus()).rejects.toThrow();
  });
});

describe("getRetentionPolicy", () => {
  it("parses the retention policy, including a null (indefinite) field", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, RETENTION));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getRetentionPolicy();

    expect(result.recordingRetentionDays).toBe(90);
    expect(result.transcriptRetentionDays).toBeNull();

    const [call] = lastCalls(fetchMock);
    expect(call?.url).toContain("/api/v1/compliance/retention");
    expect(call?.init.method ?? "GET").toBe("GET");
  });
});

describe("updateRetentionPolicy", () => {
  it("PUTs the validated body and parses the updated policy", async () => {
    const updated: RetentionPolicy = { recordingRetentionDays: 30, transcriptRetentionDays: 365 };
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, updated));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateRetentionPolicy({
      recordingRetentionDays: 30,
      transcriptRetentionDays: 365,
    });

    expect(result.recordingRetentionDays).toBe(30);
    expect(result.transcriptRetentionDays).toBe(365);

    const [call] = lastCalls(fetchMock);
    expect(call?.url).toContain("/api/v1/compliance/retention");
    expect(call?.init.method).toBe("PUT");
    expect(String(call?.init.body)).toContain("recordingRetentionDays");
  });

  it("rejects an empty update (no fields provided) before calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateRetentionPolicy({})).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("eraseCustomer", () => {
  it("POSTs the validated request and parses the erasure result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, ERASURE_RESULT));
    vi.stubGlobal("fetch", fetchMock);

    const result = await eraseCustomer({
      customerId: ERASURE_RESULT.customerId,
      reason: "data subject request",
    });

    expect(result.anonymizedCustomer).toBe(true);
    expect(result.deletedTranscriptTurns).toBe(42);

    const [call] = lastCalls(fetchMock);
    expect(call?.url).toContain("/api/v1/compliance/erasure");
    expect(call?.init.method).toBe("POST");
    expect(String(call?.init.body)).toContain(ERASURE_RESULT.customerId);
  });

  it("rejects a non-UUID customerId before calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(eraseCustomer({ customerId: "not-a-uuid" })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("runRetentionSweep", () => {
  it("POSTs and returns the 202 queued acknowledgement body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(202, { queued: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runRetentionSweep();

    expect(result.queued).toBe(true);

    const [call] = lastCalls(fetchMock);
    expect(call?.url).toContain("/api/v1/compliance/retention/sweep");
    expect(call?.init.method).toBe("POST");
  });

  it("defaults to queued when the body is empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(202));
    vi.stubGlobal("fetch", fetchMock);

    await expect(runRetentionSweep()).resolves.toEqual({ queued: true });
  });
});
