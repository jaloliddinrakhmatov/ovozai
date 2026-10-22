import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@ovozai/database";
import type { StorageProvider } from "@ovozai/integrations";
import { processRetentionSweepJob } from "./retention-sweep-processor";

const NOW = new Date("2026-10-22T00:00:00.000Z");

function makeStorage(): StorageProvider {
  return {
    name: "mock",
    put: vi.fn().mockResolvedValue(undefined),
    getUrl: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

describe("processRetentionSweepJob", () => {
  it("purges recordings + transcripts older than the policy and clears keys", async () => {
    const storage = makeStorage();
    const callFindMany = vi
      .fn()
      // recordings query
      .mockResolvedValueOnce([
        { id: "call-1", recordingObjectKey: "org/o1/calls/call-1/rec.opus" },
        { id: "call-2", recordingObjectKey: "org/o1/calls/call-2/rec.opus" },
      ])
      // transcripts query
      .mockResolvedValueOnce([{ id: "call-1" }, { id: "call-2" }]);
    const callUpdateMany = vi.fn().mockResolvedValue({ count: 2 });
    const transcriptFindMany = vi.fn().mockResolvedValue([{ id: "t-1" }, { id: "t-2" }]);
    const transcriptTurnDeleteMany = vi.fn().mockResolvedValue({ count: 9 });
    const transcriptDeleteMany = vi.fn().mockResolvedValue({ count: 2 });

    const prisma = {
      organization: {
        findUnique: vi.fn().mockResolvedValue({ recordingRetentionDays: 30, transcriptRetentionDays: 90 }),
      },
      call: { findMany: callFindMany, updateMany: callUpdateMany },
      transcript: { findMany: transcriptFindMany, deleteMany: transcriptDeleteMany },
      transcriptTurn: { deleteMany: transcriptTurnDeleteMany },
    } as unknown as PrismaClient;

    const result = await processRetentionSweepJob({ prisma, storage, now: NOW }, { organizationId: "o1" });

    expect(storage.delete).toHaveBeenCalledTimes(2);
    expect(callUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["call-1", "call-2"] }, organizationId: "o1" },
      data: { recordingObjectKey: null },
    });
    expect(result.deletedRecordings).toBe(2);
    expect(result.deletedTranscripts).toBe(2);
    expect(result.deletedTranscriptTurns).toBe(9);
    // cutoffs are now - N days
    expect(result.recordingCutoff).toBe(new Date(NOW.getTime() - 30 * 86_400_000).toISOString());
    expect(result.transcriptCutoff).toBe(new Date(NOW.getTime() - 90 * 86_400_000).toISOString());
  });

  it("does nothing when the org has no retention policy", async () => {
    const storage = makeStorage();
    const callFindMany = vi.fn();
    const prisma = {
      organization: {
        findUnique: vi.fn().mockResolvedValue({ recordingRetentionDays: null, transcriptRetentionDays: null }),
      },
      call: { findMany: callFindMany, updateMany: vi.fn() },
      transcript: { findMany: vi.fn(), deleteMany: vi.fn() },
      transcriptTurn: { deleteMany: vi.fn() },
    } as unknown as PrismaClient;

    const result = await processRetentionSweepJob({ prisma, storage, now: NOW }, { organizationId: "o1" });

    expect(callFindMany).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
    expect(result).toEqual({
      organizationId: "o1",
      recordingCutoff: null,
      transcriptCutoff: null,
      deletedRecordings: 0,
      deletedTranscripts: 0,
      deletedTranscriptTurns: 0,
    });
  });
});
