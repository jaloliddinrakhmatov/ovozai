import { chunkText, type EmbeddingProvider } from "@ovozai/integrations";
import type { EmbeddingJob } from "@ovozai/contracts";
import type { PrismaClient } from "@ovozai/database";

export interface EmbeddingProcessorDeps {
  prisma: PrismaClient;
  embedder: EmbeddingProvider;
}

export interface EmbeddingProcessResult {
  documentId: string;
  chunks: number;
  skipped?: boolean;
}

/**
 * Ingest one knowledge document: load it, mark PROCESSING, chunk its content,
 * embed each chunk, replace its chunk rows (idempotent across retries), and mark
 * READY. Scoped by explicit `organizationId` (the worker uses the unscoped base
 * client — there is no request/tenant context here). Throws on failure so BullMQ
 * can retry; the caller sets FAILED on the terminal attempt.
 */
export async function processEmbeddingJob(
  deps: EmbeddingProcessorDeps,
  job: EmbeddingJob,
): Promise<EmbeddingProcessResult> {
  const { prisma, embedder } = deps;

  const document = await prisma.knowledgeDocument.findFirst({
    where: { id: job.documentId, organizationId: job.organizationId, deletedAt: null },
  });
  // A deleted/missing document is not an error — nothing to ingest.
  if (!document) {
    return { documentId: job.documentId, chunks: 0, skipped: true };
  }

  await prisma.knowledgeDocument.updateMany({
    where: { id: document.id },
    data: { status: "PROCESSING", error: null },
  });

  // FAQ documents are indexed one item per chunk for sharper retrieval.
  const chunks = chunkText(document.content ?? "", { splitParagraphs: document.sourceType === "FAQ" });
  const vectors = chunks.length > 0 ? await embedder.embed(chunks.map((c) => c.content)) : [];

  // Replace any prior chunks so re-runs are idempotent.
  await prisma.knowledgeChunk.deleteMany({ where: { documentId: document.id } });
  if (chunks.length > 0) {
    await prisma.knowledgeChunk.createMany({
      data: chunks.map((chunk, index) => ({
        documentId: document.id,
        knowledgeBaseId: job.knowledgeBaseId,
        organizationId: job.organizationId,
        ordinal: chunk.ordinal,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
        embedding: vectors[index] ?? [],
        embeddingModel: embedder.model,
      })),
    });
  }

  await prisma.knowledgeDocument.updateMany({
    where: { id: document.id },
    data: { status: "READY", error: null },
  });

  return { documentId: document.id, chunks: chunks.length };
}
