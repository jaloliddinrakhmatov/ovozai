import {
  API_ROUTES,
  createKnowledgeBaseRequestSchema,
  createKnowledgeDocumentRequestSchema,
  knowledgeBaseDtoSchema,
  knowledgeDocumentDtoSchema,
  paginated,
  retrievalQueryRequestSchema,
  retrievalResponseSchema,
  updateKnowledgeBaseRequestSchema,
  type CreateKnowledgeBaseRequest,
  type CreateKnowledgeDocumentRequest,
  type KnowledgeBaseDto,
  type KnowledgeDocumentDto,
  type RetrievalQueryRequest,
  type RetrievalResponse,
  type UpdateKnowledgeBaseRequest,
} from "@ovozai/contracts";
import { apiFetch } from "./api-client";
import type { PaginatedResult } from "./auth-api";

const knowledgeBaseListSchema = paginated(knowledgeBaseDtoSchema);
const knowledgeDocumentListSchema = paginated(knowledgeDocumentDtoSchema);

// --- Knowledge bases ------------------------------------------------------

/** `GET /knowledge-bases` — list knowledge bases in the active org (VIEWER+). */
export async function listKnowledgeBases(params?: {
  limit?: number;
  cursor?: string;
}): Promise<PaginatedResult<KnowledgeBaseDto>> {
  const search = new URLSearchParams();
  if (params?.limit !== undefined) search.set("limit", String(params.limit));
  if (params?.cursor) search.set("cursor", params.cursor);
  const query = search.toString();
  const path = query
    ? `${API_ROUTES.knowledgeBases.root}?${query}`
    : API_ROUTES.knowledgeBases.root;
  const data = await apiFetch(path);
  return knowledgeBaseListSchema.parse(data);
}

/** `POST /knowledge-bases` — create a knowledge base (MEMBER+). */
export async function createKnowledgeBase(
  input: CreateKnowledgeBaseRequest,
): Promise<KnowledgeBaseDto> {
  const body = createKnowledgeBaseRequestSchema.parse(input);
  const data = await apiFetch(API_ROUTES.knowledgeBases.root, { method: "POST", body });
  return knowledgeBaseDtoSchema.parse(data);
}

/** `PATCH /knowledge-bases/:id` — update a knowledge base (MEMBER+). */
export async function updateKnowledgeBase(
  id: string,
  input: UpdateKnowledgeBaseRequest,
): Promise<KnowledgeBaseDto> {
  const body = updateKnowledgeBaseRequestSchema.parse(input);
  const data = await apiFetch(API_ROUTES.knowledgeBases.byId(id), { method: "PATCH", body });
  return knowledgeBaseDtoSchema.parse(data);
}

/** `DELETE /knowledge-bases/:id` — delete a knowledge base (ADMIN+). */
export async function deleteKnowledgeBase(id: string): Promise<void> {
  await apiFetch(API_ROUTES.knowledgeBases.byId(id), { method: "DELETE" });
}

// --- Documents ------------------------------------------------------------

/** `GET /knowledge-bases/:id/documents` — list documents in a KB (VIEWER+). */
export async function listKnowledgeDocuments(
  knowledgeBaseId: string,
  params?: { limit?: number; cursor?: string },
): Promise<PaginatedResult<KnowledgeDocumentDto>> {
  const search = new URLSearchParams();
  if (params?.limit !== undefined) search.set("limit", String(params.limit));
  if (params?.cursor) search.set("cursor", params.cursor);
  const query = search.toString();
  const base = API_ROUTES.knowledgeBases.documents(knowledgeBaseId);
  const path = query ? `${base}?${query}` : base;
  const data = await apiFetch(path);
  return knowledgeDocumentListSchema.parse(data);
}

/**
 * `POST /knowledge-bases/:id/documents` — add a TEXT/FAQ document (MEMBER+).
 * The document starts `PENDING`; ingestion (chunk + embed) runs asynchronously.
 */
export async function createKnowledgeDocument(
  knowledgeBaseId: string,
  input: CreateKnowledgeDocumentRequest,
): Promise<KnowledgeDocumentDto> {
  const body = createKnowledgeDocumentRequestSchema.parse(input);
  const data = await apiFetch(API_ROUTES.knowledgeBases.documents(knowledgeBaseId), {
    method: "POST",
    body,
  });
  return knowledgeDocumentDtoSchema.parse(data);
}

/** `GET /knowledge-bases/:id/documents/:docId` — fetch one document (VIEWER+). */
export async function getKnowledgeDocument(
  knowledgeBaseId: string,
  documentId: string,
): Promise<KnowledgeDocumentDto> {
  const data = await apiFetch(API_ROUTES.knowledgeBases.document(knowledgeBaseId, documentId));
  return knowledgeDocumentDtoSchema.parse(data);
}

/** `DELETE /knowledge-bases/:id/documents/:docId` — delete a document (MEMBER+). */
export async function deleteKnowledgeDocument(
  knowledgeBaseId: string,
  documentId: string,
): Promise<void> {
  await apiFetch(API_ROUTES.knowledgeBases.document(knowledgeBaseId, documentId), {
    method: "DELETE",
  });
}

// --- Retrieval ------------------------------------------------------------

/** `POST /knowledge-bases/:id/query` — semantic search over ready chunks (VIEWER+). */
export async function queryKnowledgeBase(
  knowledgeBaseId: string,
  input: RetrievalQueryRequest,
): Promise<RetrievalResponse> {
  const body = retrievalQueryRequestSchema.parse(input);
  const data = await apiFetch(API_ROUTES.knowledgeBases.query(knowledgeBaseId), {
    method: "POST",
    body,
  });
  return retrievalResponseSchema.parse(data);
}
