import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentDto, AgentVersionDto } from "@ovozai/contracts";
import {
  createAgent,
  listAgentVersions,
  listAgents,
  publishAgent,
  restoreAgentVersion,
} from "./agents-api";
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

const AGENT: AgentDto = {
  id: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  name: "Reception",
  status: "DRAFT",
  defaultLanguage: "UZ",
  systemPrompt: null,
  voiceId: null,
  greeting: null,
  transferNumber: null,
  config: null,
  createdAt: "2026-10-22T00:00:00.000Z",
  updatedAt: "2026-10-22T00:00:00.000Z",
};

const VERSION: AgentVersionDto = {
  id: "33333333-3333-4333-8333-333333333333",
  agentId: AGENT.id,
  version: 3,
  config: { systemPrompt: "hi" },
  publishedAt: "2026-10-22T00:00:00.000Z",
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

describe("listAgents", () => {
  it("parses a paginated envelope and sends an authenticated GET", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse(200, {
        data: [AGENT],
        pageInfo: { nextCursor: null, hasNextPage: false },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await listAgents();

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.name).toBe("Reception");
    expect(result.pageInfo.hasNextPage).toBe(false);

    const [call] = lastCalls(fetchMock);
    expect(call?.url).toContain("/api/v1/agents");
    expect(call?.init.method ?? "GET").toBe("GET");
    expect(call?.init.headers.Authorization).toBe("Bearer tok");
  });

  it("appends limit and cursor query parameters", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        makeResponse(200, { data: [], pageInfo: { nextCursor: null, hasNextPage: false } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await listAgents({ limit: 10, cursor: "abc" });

    const [call] = lastCalls(fetchMock);
    expect(call?.url).toContain("limit=10");
    expect(call?.url).toContain("cursor=abc");
  });

  it("rejects when the response does not match the schema", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeResponse(200, { data: [{ id: "not-a-uuid" }], pageInfo: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listAgents()).rejects.toThrow();
  });
});

describe("createAgent — ADMIN-gated mutation", () => {
  it("POSTs the validated request body and parses the created agent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(201, AGENT));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createAgent({ name: "Reception", defaultLanguage: "UZ" });

    expect(result.id).toBe(AGENT.id);
    const [call] = lastCalls(fetchMock);
    expect(call?.url).toContain("/api/v1/agents");
    expect(call?.init.method).toBe("POST");
    expect(call?.init.headers.Authorization).toBe("Bearer tok");
    expect(String(call?.init.body)).toContain("Reception");
  });

  it("rejects an invalid request before calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(createAgent({ name: "" } as never)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("publishAgent / versions / restore", () => {
  it("publishes to the publish route and parses the new version", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(201, VERSION));
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishAgent(AGENT.id);

    expect(result.version).toBe(3);
    const [call] = lastCalls(fetchMock);
    expect(call?.url).toContain(`/api/v1/agents/${AGENT.id}/publish`);
    expect(call?.init.method).toBe("POST");
  });

  it("lists versions and restores a specific version", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        makeResponse(200, { data: [VERSION], pageInfo: { nextCursor: null, hasNextPage: false } }),
      )
      .mockResolvedValueOnce(makeResponse(200, AGENT));
    vi.stubGlobal("fetch", fetchMock);

    const versions = await listAgentVersions(AGENT.id);
    expect(versions.data[0]?.version).toBe(3);

    const restored = await restoreAgentVersion(AGENT.id, 3);
    expect(restored.id).toBe(AGENT.id);

    const calls = lastCalls(fetchMock);
    expect(calls[0]?.url).toContain(`/api/v1/agents/${AGENT.id}/versions`);
    expect(calls[1]?.url).toContain(`/api/v1/agents/${AGENT.id}/versions/3/restore`);
    expect(calls[1]?.init.method).toBe("POST");
  });
});
