import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CallDto, CallEventDto, TranscriptDto } from "@ovozai/contracts";
import {
  getCallRecording,
  getCallTranscript,
  listCallEvents,
  listCalls,
} from "./calls-api";
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

const CALL: CallDto = {
  id: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  agentId: "33333333-3333-4333-8333-333333333333",
  customerId: null,
  direction: "INBOUND",
  status: "COMPLETED",
  fromE164: "+998901234567",
  toE164: "+998900000000",
  language: "UZ",
  startedAt: "2026-10-22T00:00:00.000Z",
  answeredAt: "2026-10-22T00:00:05.000Z",
  endedAt: "2026-10-22T00:02:05.000Z",
  durationSec: 120,
  endedReason: "hangup",
  recordingObjectKey: null,
  recordingConsent: true,
  costCents: 42,
  phoneNumberId: null,
  transferredTo: null,
  externalRef: null,
  createdAt: "2026-10-22T00:00:00.000Z",
  updatedAt: "2026-10-22T00:02:05.000Z",
};

const EVENT: CallEventDto = {
  id: "44444444-4444-4444-8444-444444444444",
  callId: CALL.id,
  type: "call.answered",
  payload: null,
  occurredAt: "2026-10-22T00:00:05.000Z",
};

const TRANSCRIPT: TranscriptDto = {
  id: "55555555-5555-4555-8555-555555555555",
  callId: CALL.id,
  language: "UZ",
  fullText: "Salom",
  turns: [
    {
      id: "66666666-6666-4666-8666-666666666666",
      role: "CALLER",
      text: "Salom",
      startMs: 0,
      endMs: 900,
      confidence: 0.98,
      language: "UZ",
    },
  ],
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

describe("listCalls", () => {
  it("parses a paginated envelope and sends an authenticated GET", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse(200, {
        data: [CALL],
        pageInfo: { nextCursor: null, hasNextPage: false },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await listCalls();

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.status).toBe("COMPLETED");
    expect(result.data[0]?.durationSec).toBe(120);
    expect(result.pageInfo.hasNextPage).toBe(false);

    const [call] = lastCalls(fetchMock);
    expect(call?.url).toContain("/api/v1/calls");
    expect(call?.init.method ?? "GET").toBe("GET");
    expect(call?.init.headers.Authorization).toBe("Bearer tok");
  });

  it("encodes the status, direction, agentId, and date-range filters", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        makeResponse(200, { data: [], pageInfo: { nextCursor: null, hasNextPage: false } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await listCalls({
      limit: 25,
      cursor: "abc",
      status: "COMPLETED",
      direction: "INBOUND",
      agentId: "33333333-3333-4333-8333-333333333333",
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-22T00:00:00.000Z",
    });

    const [call] = lastCalls(fetchMock);
    expect(call?.url).toContain("limit=25");
    expect(call?.url).toContain("cursor=abc");
    expect(call?.url).toContain("status=COMPLETED");
    expect(call?.url).toContain("direction=INBOUND");
    expect(call?.url).toContain("agentId=33333333-3333-4333-8333-333333333333");
    // URLSearchParams encodes the colons in the ISO timestamps.
    expect(call?.url).toContain("from=2026-10-01T00%3A00%3A00.000Z");
    expect(call?.url).toContain("to=2026-10-22T00%3A00%3A00.000Z");
  });

  it("rejects when the response does not match the schema", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeResponse(200, { data: [{ id: "not-a-uuid" }], pageInfo: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listCalls()).rejects.toThrow();
  });
});

describe("listCallEvents", () => {
  it("parses the paginated events envelope for a call", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse(200, {
        data: [EVENT],
        pageInfo: { nextCursor: null, hasNextPage: false },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await listCallEvents(CALL.id);

    expect(result.data[0]?.type).toBe("call.answered");
    const [call] = lastCalls(fetchMock);
    expect(call?.url).toContain(`/api/v1/calls/${CALL.id}/events`);
  });
});

describe("getCallTranscript", () => {
  it("parses and returns the transcript when present", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, TRANSCRIPT));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getCallTranscript(CALL.id);

    expect(result?.turns).toHaveLength(1);
    expect(result?.turns[0]?.role).toBe("CALLER");
    const [call] = lastCalls(fetchMock);
    expect(call?.url).toContain(`/api/v1/calls/${CALL.id}/transcript`);
  });

  it("returns null (not a thrown error) when the transcript is a 404", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse(404, {
        type: "about:blank",
        title: "Not Found",
        status: 404,
        code: "NOT_FOUND",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getCallTranscript(CALL.id)).resolves.toBeNull();
  });

  it("re-throws non-404 failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse(500, {
        type: "about:blank",
        title: "Server Error",
        status: 500,
        code: "INTERNAL",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getCallTranscript(CALL.id)).rejects.toThrow();
  });
});

describe("getCallRecording — ADMIN-gated", () => {
  it("parses the recording envelope (null url in Phase 4)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeResponse(200, { url: null, expiresAt: null }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getCallRecording(CALL.id);

    expect(result.url).toBeNull();
    expect(result.expiresAt).toBeNull();
    const [call] = lastCalls(fetchMock);
    expect(call?.url).toContain(`/api/v1/calls/${CALL.id}/recording`);
  });
});
