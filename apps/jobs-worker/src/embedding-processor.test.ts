import { describe, expect, it, vi } from "vitest";
import { LocalLexicalEmbeddingProvider, cosineSimilarity } from "@ovozai/integrations";
import type { PrismaClient } from "@ovozai/database";
import { processEmbeddingJob } from "./embedding-processor";

const JOB = { documentId: "doc-1", knowledgeBaseId: "kb-1", organizationId: "org-1" };

function mockPrisma(document: unknown) {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const createMany = vi.fn().mockResolvedValue({ count: 0 });
  const findFirst = vi.fn().mockResolvedValue(document);
  const prisma = {
    knowledgeDocument: { findFirst, updateMany },
    knowledgeChunk: { deleteMany, createMany },
  } as unknown as PrismaClient;
  return { prisma, findFirst, updateMany, deleteMany, createMany };
}

describe("processEmbeddingJob", () => {
  it("chunks, embeds, stores chunks, and marks the document READY", async () => {
    const embedder = new LocalLexicalEmbeddingProvider(128);
    const { prisma, updateMany, deleteMany, createMany } = mockPrisma({
      id: "doc-1",
      content: "Opening hours are nine to six.\n\nWe are closed on Sundays.",
      deletedAt: null,
    });

    const result = await processEmbeddingJob({ prisma, embedder }, JOB);

    expect(result.chunks).toBeGreaterThan(0);
    expect(deleteMany).toHaveBeenCalledWith({ where: { documentId: "doc-1" } });
    expect(createMany).toHaveBeenCalledTimes(1);
    const created = createMany.mock.calls[0]![0].data as Array<{ embeddingModel: string; embedding: number[] }>;
    expect(created.length).toBe(result.chunks);
    expect(created[0]!.embeddingModel).toBe(embedder.model);
    expect(created[0]!.embedding.length).toBe(128);
    // Last document update marks READY.
    const statuses = updateMany.mock.calls.map((c) => (c[0] as { data: { status?: string } }).data.status);
    expect(statuses).toContain("PROCESSING");
    expect(statuses).toContain("READY");
  });

  it("skips a missing/deleted document without error", async () => {
    const embedder = new LocalLexicalEmbeddingProvider(128);
    const { prisma, createMany } = mockPrisma(null);
    const result = await processEmbeddingJob({ prisma, embedder }, JOB);
    expect(result.skipped).toBe(true);
    expect(result.chunks).toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });
});

describe("lexical retrieval relevance", () => {
  it("ranks the same-language chunk highest for UZ / RU / EN queries", async () => {
    const embedder = new LocalLexicalEmbeddingProvider(256);
    const docs = [
      { id: "uz", text: "Ish vaqti dushanbadan jumagacha soat to'qqizdan oltigacha." },
      { id: "ru", text: "Режим работы с понедельника по пятницу с девяти до шести." },
      { id: "en", text: "Our opening hours are Monday to Friday from nine to six." },
    ];
    const vectors = await embedder.embed(docs.map((d) => d.text));

    const best = async (query: string): Promise<string> => {
      const q = (await embedder.embed([query]))[0]!;
      return docs
        .map((d, i) => ({ id: d.id, score: cosineSimilarity(q, vectors[i] ?? []) }))
        .sort((a, b) => b.score - a.score)[0]!.id;
    };

    expect(await best("opening hours Monday Friday nine six")).toBe("en");
    expect(await best("Режим работы понедельник пятница")).toBe("ru");
    expect(await best("Ish vaqti dushanba juma")).toBe("uz");
  });
});
