import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  WebhookDeliveryDto,
  WebhookEndpointCreatedDto,
  WebhookEndpointDto,
} from "@ovozai/contracts";
import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  listWebhookDeliveries,
  listWebhookEndpoints,
  updateWebhookEndpoint,
} from "./webhooks-api";
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

const ENDPOINT: WebhookEndpointDto = {
  id: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  url: "https://example.com/webhooks/ovozai",
  events: ["call.completed", "transcript.ready"],
  status: "ACTIVE",
  createdAt: "2026-10-22T00:00:00.000Z",
  updatedAt: "2026-10-22T00:00:00.000Z",
};

const ENDPOINT_CREATED: WebhookEndpointCreatedDto = {
  ...ENDPOINT,
  secret: "whsec_super_secret_value",
};

const DELIVERY: WebhookDeliveryDto = {
  id: "33333333-3333-4333-8333-333333333333",
  endpointId: ENDPOINT.id,
  event: "call.completed",
  status: "FAILED",
  attempts: 3,
  responseStatus: 500,
  lastAttemptAt: "2026-10-22T00:05:00.000Z",
  createdAt: "2026-10-22T00:00:00.000Z",
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

describe("listWebhookEndpoints", () => {
  it("parses a paginated envelope and sends an authenticated GET", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse(200, {
        data: [ENDPOINT],
        pageInfo: { nextCursor: null, hasNextPage: false },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await listWebhookEndpoints();

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.url).toBe(ENDPOINT.url);
    expect(result.data[0]?.status).toBe("ACTIVE");

    const [call] = lastCalls(fetchMock);
    expect(call?.url).toContain("/api/v1/webhooks/endpoints");
    expect(call?.init.method ?? "GET").toBe("GET");
    expect(call?.init.headers.Authorization).toBe("Bearer tok");
  });

  it("rejects when the response does not match the schema", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeResponse(200, { data: [{ id: "not-a-uuid" }], pageInfo: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listWebhookEndpoints()).rejects.toThrow();
  });
});

describe("createWebhookEndpoint — one-time secret", () => {
  it("POSTs the validated body and parses the once-shown secret", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(201, ENDPOINT_CREATED));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createWebhookEndpoint({
      url: "https://example.com/webhooks/ovozai",
      events: ["call.completed", "transcript.ready"],
    });

    expect(result.secret).toBe("whsec_super_secret_value");
    expect(result.id).toBe(ENDPOINT.id);

    const [call] = lastCalls(fetchMock);
    expect(call?.url).toContain("/api/v1/webhooks/endpoints");
    expect(call?.init.method).toBe("POST");
    expect(String(call?.init.body)).toContain("call.completed");
  });

  it("rejects an invalid request (no events) before calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createWebhookEndpoint({ url: "https://example.com", events: [] } as never),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("updateWebhookEndpoint / deleteWebhookEndpoint", () => {
  it("PATCHes a status change and parses the endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeResponse(200, { ...ENDPOINT, status: "DISABLED" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateWebhookEndpoint(ENDPOINT.id, { status: "DISABLED" });

    expect(result.status).toBe("DISABLED");
    const [call] = lastCalls(fetchMock);
    expect(call?.url).toContain(`/api/v1/webhooks/endpoints/${ENDPOINT.id}`);
    expect(call?.init.method).toBe("PATCH");
  });

  it("DELETEs an endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(204));
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteWebhookEndpoint(ENDPOINT.id)).resolves.toBeUndefined();
    const [call] = lastCalls(fetchMock);
    expect(call?.url).toContain(`/api/v1/webhooks/endpoints/${ENDPOINT.id}`);
    expect(call?.init.method).toBe("DELETE");
  });
});

describe("listWebhookDeliveries", () => {
  it("parses the deliveries envelope and encodes the endpointId + status filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse(200, {
        data: [DELIVERY],
        pageInfo: { nextCursor: null, hasNextPage: false },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await listWebhookDeliveries({
      limit: 25,
      cursor: "abc",
      endpointId: ENDPOINT.id,
      status: "FAILED",
    });

    expect(result.data[0]?.attempts).toBe(3);
    expect(result.data[0]?.responseStatus).toBe(500);

    const [call] = lastCalls(fetchMock);
    expect(call?.url).toContain("/api/v1/webhooks/deliveries");
    expect(call?.url).toContain("limit=25");
    expect(call?.url).toContain("cursor=abc");
    expect(call?.url).toContain(`endpointId=${ENDPOINT.id}`);
    expect(call?.url).toContain("status=FAILED");
  });
});
