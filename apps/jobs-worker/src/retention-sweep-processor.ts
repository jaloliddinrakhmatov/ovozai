import type { RetentionSweepJob } from "@ovozai/contracts";
import type { PrismaClient } from "@ovozai/database";
import type { StorageProvider } from "@ovozai/integrations";

export interface RetentionSweepProcessorDeps {
  prisma: PrismaClient;
  storage: StorageProvider;
  /** Injectable clock for deterministic tests; defaults to now. */
  now?: Date;
}

export interface RetentionSweepResult {
  organizationId: string;
  recordingCutoff: string | null;
  transcriptCutoff: string | null;
  deletedRecordings: number;
  deletedTranscripts: number;
  deletedTranscriptTurns: number;
}

const DAY_MS = 86_400_000;

/** A call is "older than cutoff" by its end time, or its creation time if it never
 *  ended (so stuck/failed calls still age out). */
function olderThan(cutoff: Date) {
  return {
    OR: [{ endedAt: { lt: cutoff } }, { endedAt: null, createdAt: { lt: cutoff } }],
  };
}

/**
 * Purge call recordings and transcript content for one organization that are older
 * than its retention policy (Phase 7, docs/COMPLIANCE.md §3). Recordings and
 * transcripts have independent windows. Runs on the unscoped base client with an
 * explicit organizationId (workers have no request/tenant context). Idempotent.
 */
export async function processRetentionSweepJob(
  deps: RetentionSweepProcessorDeps,
  job: RetentionSweepJob,
): Promise<RetentionSweepResult> {
  const { prisma, storage } = deps;
  const now = deps.now ?? new Date();
  const { organizationId } = job;

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { recordingRetentionDays: true, transcriptRetentionDays: true },
  });

  const result: RetentionSweepResult = {
    organizationId,
    recordingCutoff: null,
    transcriptCutoff: null,
    deletedRecordings: 0,
    deletedTranscripts: 0,
    deletedTranscriptTurns: 0,
  };
  if (!org) return result;

  // --- Recordings ---
  if (org.recordingRetentionDays != null) {
    const cutoff = new Date(now.getTime() - org.recordingRetentionDays * DAY_MS);
    result.recordingCutoff = cutoff.toISOString();
    const calls = await prisma.call.findMany({
      where: { organizationId, recordingObjectKey: { not: null }, ...olderThan(cutoff) },
      select: { id: true, recordingObjectKey: true },
    });
    for (const call of calls) {
      if (!call.recordingObjectKey) continue;
      try {
        await storage.delete(call.recordingObjectKey);
        result.deletedRecordings += 1;
      } catch (error) {
        console.error("[jobs-worker] retention: failed to delete recording", call.recordingObjectKey, error);
      }
    }
    if (calls.length > 0) {
      await prisma.call.updateMany({
        where: { id: { in: calls.map((c) => c.id) }, organizationId },
        data: { recordingObjectKey: null },
      });
    }
  }

  // --- Transcripts ---
  if (org.transcriptRetentionDays != null) {
    const cutoff = new Date(now.getTime() - org.transcriptRetentionDays * DAY_MS);
    result.transcriptCutoff = cutoff.toISOString();
    const calls = await prisma.call.findMany({
      where: { organizationId, ...olderThan(cutoff) },
      select: { id: true },
    });
    const callIds = calls.map((c) => c.id);
    if (callIds.length > 0) {
      const transcripts = await prisma.transcript.findMany({
        where: { callId: { in: callIds }, organizationId },
        select: { id: true },
      });
      const transcriptIds = transcripts.map((t) => t.id);
      if (transcriptIds.length > 0) {
        result.deletedTranscriptTurns = (
          await prisma.transcriptTurn.deleteMany({
            where: { transcriptId: { in: transcriptIds }, organizationId },
          })
        ).count;
        result.deletedTranscripts = (
          await prisma.transcript.deleteMany({ where: { id: { in: transcriptIds }, organizationId } })
        ).count;
      }
    }
  }

  return result;
}
