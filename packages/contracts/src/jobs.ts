import { z } from "zod";

/** BullMQ queue names shared between producers (apps/api) and the jobs-worker. */
export const JOB_QUEUES = {
  embedding: "embedding",
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
