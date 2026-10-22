-- Phase 7 — per-organization data-retention policy (Law No. ZRU-547).
-- Max age (days) before call recordings / transcript content are purged by the
-- retention sweep (apps/jobs-worker). NULL = retain indefinitely.

-- AlterTable
ALTER TABLE "organizations"
  ADD COLUMN "recording_retention_days" INTEGER,
  ADD COLUMN "transcript_retention_days" INTEGER;
