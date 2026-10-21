import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@ovozai/database";
import { processWebhookJob } from "./webhook-processor";

const JOB = { deliveryId: "d1", organizationId: "org-1" };

function mockPrisma(delivery: unknown, endpoint: unknown) {
  const deliveryUpdate = vi.fn().mockResolvedValue({});
  const prisma = {
    webhookDelivery: {
      findFirst: vi.fn().mockResolvedValue(delivery),
      update: deliveryUpdate,
    },
    webhookEndpoint: { findFirst: vi.fn().mockResolvedValue(endpoint) },
  } as unknown as PrismaClient;
  return { prisma, deliveryUpdate };
}

const DELIVERY = {
  id: "d1",
  endpointId: "e1",
  event: "call.completed",
  payload: { callId: "c1" },
  attempts: 0,
  createdAt: new Date(),
};
const ENDPOINT = { id: "e1", url: "https://hook.example.uz/x", secret: "whsec_test", status: "ACTIVE", deletedAt: null };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("processWebhookJob", () => {
  it("signs and delivers, marking the attempt SUCCEEDED", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const { prisma, deliveryUpdate } = mockPrisma(DELIVERY, ENDPOINT);

    const result = await processWebhookJob({ prisma }, JOB);

    expect(result.status).toBe("succeeded");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const headers = fetchMock.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers["OvozAI-Signature"]).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(headers["OvozAI-Event"]).toBe("call.completed");
    expect(deliveryUpdate.mock.calls[0]![0].data.status).toBe("SUCCEEDED");
  });

  it("marks FAILED and throws (for retry) on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const { prisma, deliveryUpdate } = mockPrisma(DELIVERY, ENDPOINT);

    await expect(processWebhookJob({ prisma }, JOB)).rejects.toThrow();
    expect(deliveryUpdate.mock.calls[0]![0].data.status).toBe("FAILED");
  });

  it("fails without throwing when the endpoint is gone", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { prisma } = mockPrisma(DELIVERY, null);
    const result = await processWebhookJob({ prisma }, JOB);
    expect(result.status).toBe("failed");
  });
});
