import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerDto } from "@ovozai/contracts";
import { createCustomer, deleteCustomer, listCustomers } from "./customers-api";
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

const CUSTOMER: CustomerDto = {
  id: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  phoneE164: "+998901234567",
  name: "Aziz",
  email: null,
  locale: "uz-UZ",
  notes: null,
  tags: ["vip"],
  lastContactedAt: null,
  createdAt: "2026-10-22T00:00:00.000Z",
  updatedAt: "2026-10-22T00:00:00.000Z",
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

describe("listCustomers", () => {
  it("encodes the q and phoneE164 search filters", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        makeResponse(200, {
          data: [CUSTOMER],
          pageInfo: { nextCursor: null, hasNextPage: false },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await listCustomers({ q: "aziz vip", phoneE164: "+998" });

    expect(result.data[0]?.phoneE164).toBe("+998901234567");
    const [call] = lastCalls(fetchMock);
    // URLSearchParams encodes the space and the leading plus.
    expect(call?.url).toContain("q=aziz+vip");
    expect(call?.url).toContain("phoneE164=%2B998");
    expect(call?.init.headers.Authorization).toBe("Bearer tok");
  });
});

describe("createCustomer", () => {
  it("validates E.164 before calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(createCustomer({ phoneE164: "0901234567" })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs a valid customer and parses the result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(201, CUSTOMER));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createCustomer({ phoneE164: "+998901234567", name: "Aziz" });

    expect(result.id).toBe(CUSTOMER.id);
    const [call] = lastCalls(fetchMock);
    expect(call?.init.method).toBe("POST");
    expect(call?.url).toContain("/api/v1/customers");
  });
});

describe("deleteCustomer — ADMIN-gated mutation", () => {
  it("issues a DELETE to the customer resource and resolves on 204", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(204));
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteCustomer(CUSTOMER.id)).resolves.toBeUndefined();
    const [call] = lastCalls(fetchMock);
    expect(call?.init.method).toBe("DELETE");
    expect(call?.url).toContain(`/api/v1/customers/${CUSTOMER.id}`);
  });
});
