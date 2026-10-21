import { z } from "zod";
import { languageSchema } from "./agent";

export const knowledgeBaseStatusSchema = z.enum(["ACTIVE", "DISABLED"]);
export type KnowledgeBaseStatus = z.infer<typeof knowledgeBaseStatusSchema>;

export const knowledgeDocumentStatusSchema = z.enum(["PENDING", "PROCESSING", "READY", "FAILED"]);
export type KnowledgeDocumentStatus = z.infer<typeof knowledgeDocumentStatusSchema>;

export const knowledgeSourceTypeSchema = z.enum(["UPLOAD", "URL", "TEXT", "FAQ"]);
export type KnowledgeSourceType = z.infer<typeof knowledgeSourceTypeSchema>;

export const knowledgeBaseDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  agentId: z.uuid().nullable(),
  name: z.string(),
  status: knowledgeBaseStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type KnowledgeBaseDto = z.infer<typeof knowledgeBaseDtoSchema>;

export const knowledgeDocumentDtoSchema = z.object({
  id: z.uuid(),
  knowledgeBaseId: z.uuid(),
  organizationId: z.uuid(),
  title: z.string(),
  sourceType: knowledgeSourceTypeSchema,
  status: knowledgeDocumentStatusSchema,
  bytes: z.number().int().nullable(),
  /** Number of chunks produced once ingested (0 until READY). */
  chunkCount: z.number().int(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type KnowledgeDocumentDto = z.infer<typeof knowledgeDocumentDtoSchema>;

export const createKnowledgeBaseRequestSchema = z.object({
  name: z.string().min(1).max(200),
  agentId: z.uuid().optional(),
});
export type CreateKnowledgeBaseRequest = z.infer<typeof createKnowledgeBaseRequestSchema>;

export const updateKnowledgeBaseRequestSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    status: knowledgeBaseStatusSchema.optional(),
    agentId: z.uuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateKnowledgeBaseRequest = z.infer<typeof updateKnowledgeBaseRequestSchema>;

/**
 * Create a document. Phase 3 ingests inline TEXT/FAQ content only; UPLOAD/URL
 * sources (object storage + SSRF handling) arrive in a later phase.
 */
export const createKnowledgeDocumentRequestSchema = z.object({
  title: z.string().min(1).max(300),
  sourceType: z.enum(["TEXT", "FAQ"]).default("TEXT"),
  content: z.string().min(1).max(200_000),
});
export type CreateKnowledgeDocumentRequest = z.infer<typeof createKnowledgeDocumentRequestSchema>;

/** A retrieval hit: a chunk ranked by similarity to the query. */
export const retrievalResultSchema = z.object({
  chunkId: z.uuid(),
  documentId: z.uuid(),
  documentTitle: z.string(),
  ordinal: z.number().int(),
  content: z.string(),
  /** Cosine similarity in [0, 1] (higher is more relevant). */
  score: z.number(),
});
export type RetrievalResult = z.infer<typeof retrievalResultSchema>;

export const retrievalQueryRequestSchema = z.object({
  query: z.string().min(1).max(2000),
  topK: z.coerce.number().int().min(1).max(20).default(5),
  language: languageSchema.optional(),
});
export type RetrievalQueryRequest = z.infer<typeof retrievalQueryRequestSchema>;

export const retrievalResponseSchema = z.object({
  query: z.string(),
  results: z.array(retrievalResultSchema),
});
export type RetrievalResponse = z.infer<typeof retrievalResponseSchema>;
