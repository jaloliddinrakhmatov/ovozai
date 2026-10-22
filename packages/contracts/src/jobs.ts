import { z } from "zod";

/** BullMQ queue names shared between producers (apps/api) and the jobs-worker. */
export const JOB_QUEUES = {
  embedding: "embedding",
  webhook: "webhook",
  usageRollup: "usage-rollup",
  retention: "retention",
} as const;
export type JobQueue = (typeof JOB_QUEUES)[keyof typeof JOB_QUEUES];

/** Stable job name within the embedding queue. */
export const EMBEDDING_JOB_NAME = "embed-document" as const;

/** Payload for an ingestion job: chunk + embed one knowledge document. */
export const embeddingJobSchema = z.object({
  documentId: z.uuid(),
  knowledgeBaseId: z.uuid(),
  organizationId: z.uuid(),
});
export type EmbeddingJob = z.infer<typeof embeddingJobSchema>;

/** Stable job name within the webhook queue. */
export const WEBHOOK_JOB_NAME = "deliver-webhook" as const;

/** Payload for a webhook delivery job: deliver one pending WebhookDelivery. */
export const webhookJobSchema = z.object({
  deliveryId: z.uuid(),
  organizationId: z.uuid(),
});
export type WebhookJob = z.infer<typeof webhookJobSchema>;

/** Stable job name within the usage-rollup queue. */
export const USAGE_ROLLUP_JOB_NAME = "rollup-usage" as const;

/** Payload for a usage-rollup job: aggregate UsageRecords for an org + period. */
export const usageRollupJobSchema = z.object({
  organizationId: z.uuid(),
  periodKey: z.string().min(1).max(20),
});
export type UsageRollupJob = z.infer<typeof usageRollupJobSchema>;

/** Stable job name within the retention queue. */
export const RETENTION_SWEEP_JOB_NAME = "sweep-retention" as const;

/** Payload for a retention-sweep job: purge expired recordings/transcripts for
 *  one organization according to its retention policy. */
export const retentionSweepJobSchema = z.object({
  organizationId: z.uuid(),
});
export type RetentionSweepJob = z.infer<typeof retentionSweepJobSchema>;
