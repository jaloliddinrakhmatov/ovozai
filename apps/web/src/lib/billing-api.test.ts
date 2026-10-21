import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanDto, SubscriptionDto, UsageSummaryResponse } from "@ovozai/contracts";
import { createSubscription, getSubscription, getUsage, listPlans } from "./billing-api";
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

const PLAN: PlanDto = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "pro",
  name: "Pro",
  priceCents: 4_900_000,
  currency: "UZS",
  limits: { callMinutes: 1000 },
  active: true,
};

const SUBSCRIPTION: SubscriptionDto = {
  id: "22222222-2222-4222-8222-222222222222",
  organizationId: "33333333-3333-4333-8333-333333333333",
  planId: PLAN.id,
  planCode: "pro",
  status: "ACTIVE",
  currentPeriodStart: "2026-10-01T00:00:00.000Z",
  currentPeriodEnd: "2026-11-01T00:00:00.000Z",
  createdAt: "2026-10-01T00:00:00.000Z",
};

const USAGE: UsageSummaryResponse = {
  periodKey: "2026-10",
  items: [{ metric: "CALL_MINUTES", periodKey: "2026-10", quantity: 12.5, rawCount: 750 }],
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

describe("listPlans", () => {
  it("parses a bare array (not a paginated envelope) and sends an authenticated GET", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, [PLAN]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listPlans();

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]?.code).toBe("pro");
    expect(result[0]?.priceCents).toBe(4_900_000);

    const [call] = lastCalls(fetchMock);
    expect(call?.url).toContain("/api/v1/billing/plans");
    expect(call?.init.method ?? "GET").toBe("GET");
    expect(call?.init.headers.Authorization).toBe("Bearer tok");
  });

  it("rejects when the payload is not a valid plan array", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, [{ id: "not-a-uuid" }]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listPlans()).rejects.toThrow();
  });
});

describe("getSubscription", () => {
  it("resolves to null when the body is JSON null (no active subscription)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, null));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getSubscription()).resolves.toBeNull();

    const [call] = lastCalls(fetchMock);
    expect(call?.url).toContain("/api/v1/billing/subscription");
  });

  it("parses the subscription when one is present", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, SUBSCRIPTION));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getSubscription();

    expect(result?.planCode).toBe("pro");
    expect(result?.status).toBe("ACTIVE");
  });
});

describe("createSubscription", () => {
  it("POSTs the validated planCode body and parses the subscription", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, SUBSCRIPTION));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createSubscription({ planCode: "pro" });

    expect(result.id).toBe(SUBSCRIPTION.id);
    const [call] = lastCalls(fetchMock);
    expect(call?.url).toContain("/api/v1/billing/subscription");
    expect(call?.init.method).toBe("POST");
    expect(String(call?.init.body)).toContain("pro");
  });

  it("rejects an empty planCode before calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(createSubscription({ planCode: "" })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getUsage", () => {
  it("parses the usage summary response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, USAGE));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getUsage();

    expect(result.periodKey).toBe("2026-10");
    expect(result.items[0]?.metric).toBe("CALL_MINUTES");
    expect(result.items[0]?.quantity).toBe(12.5);

    const [call] = lastCalls(fetchMock);
    expect(call?.url).toContain("/api/v1/billing/usage");
  });
});
