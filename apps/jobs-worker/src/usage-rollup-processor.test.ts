import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@ovozai/database";
import { processUsageRollupJob } from "./usage-rollup-processor";

describe("processUsageRollupJob", () => {
  it("aggregates raw usage records per metric and upserts rollups", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const findMany = vi.fn().mockResolvedValue([
      { metric: "CALL_MINUTES", quantity: 2 },
      { metric: "CALL_MINUTES", quantity: 3 },
      { metric: "LLM_TOKENS", quantity: 100 },
    ]);
    const prisma = {
      usageRecord: { findMany },
      usageRollup: { upsert },
    } as unknown as PrismaClient;

    const result = await processUsageRollupJob(
      { prisma },
      { organizationId: "org-1", periodKey: "2026-10" },
    );

    expect(result.metrics).toBe(2);
    expect(upsert).toHaveBeenCalledTimes(2);
    const callMinutes = upsert.mock.calls.find(
      (c) => c[0].where.organizationId_metric_periodKey.metric === "CALL_MINUTES",
    );
    expect(callMinutes![0].create.quantity).toBe(5);
    expect(callMinutes![0].create.rawCount).toBe(2);
  });

  it("does nothing when there are no records", async () => {
    const upsert = vi.fn();
    const prisma = {
      usageRecord: { findMany: vi.fn().mockResolvedValue([]) },
      usageRollup: { upsert },
    } as unknown as PrismaClient;
    const result = await processUsageRollupJob({ prisma }, { organizationId: "o", periodKey: "2026-10" });
    expect(result.metrics).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });
});
