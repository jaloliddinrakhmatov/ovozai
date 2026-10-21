import { createHash } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { cosineSimilarity, type EmbeddingProvider } from "@ovozai/integrations";
import type {
  CreateKnowledgeBaseRequest,
  CreateKnowledgeDocumentRequest,
  KnowledgeBaseDto,
  KnowledgeDocumentDto,
  PaginationQuery,
  RetrievalQueryRequest,
  RetrievalResponse,
  UpdateKnowledgeBaseRequest,
} from "@ovozai/contracts";
import { AuditService } from "../audit/audit.service";
import { Problems } from "../common/problem.exception";
import { toKnowledgeBaseDto, toKnowledgeDocumentDto } from "../common/mappers";
import type { RequestMeta } from "../common/request-context";
import type { UserPrincipal } from "../common/principal.types";
import { PrismaService } from "../prisma/prisma.service";
import { IngestionQueue } from "./ingestion.queue";
import { EMBEDDING_PROVIDER } from "./embedding.provider";

interface Page<T> {
  data: T[];
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
}

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ingestion: IngestionQueue,
    @Inject(EMBEDDING_PROVIDER) private readonly embedding: EmbeddingProvider,
  ) {}

  // --- Knowledge bases ---

  async listBases(query: PaginationQuery): Promise<Page<KnowledgeBaseDto>> {
    const take = query.limit;
    const rows = await this.prisma.tenant.knowledgeBase.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > take;
    const page = hasNextPage ? rows.slice(0, take) : rows;
    return {
      data: page.map(toKnowledgeBaseDto),
      pageInfo: { nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null, hasNextPage },
    };
  }

  async getBase(id: string): Promise<KnowledgeBaseDto> {
    return toKnowledgeBaseDto(await this.loadBase(id));
  }

  async createBase(
    principal: UserPrincipal,
    organizationId: string,
    dto: CreateKnowledgeBaseRequest,
    ctx: RequestMeta,
  ): Promise<KnowledgeBaseDto> {
    if (dto.agentId) await this.assertAgentExists(dto.agentId);
    const kb = await this.prisma.tenant.knowledgeBase.create({
      data: { organizationId, name: dto.name, agentId: dto.agentId ?? null },
    });
    await this.audit.record({
      organizationId,
      actorId: principal.userId,
      action: "knowledge_base.create",
      targetType: "KnowledgeBase",
      targetId: kb.id,
      ip: ctx.ip,
    });
    return toKnowledgeBaseDto(kb);
  }

  async updateBase(
    principal: UserPrincipal,
    organizationId: string,
    id: string,
    dto: UpdateKnowledgeBaseRequest,
    ctx: RequestMeta,
  ): Promise<KnowledgeBaseDto> {
    await this.loadBase(id);
    if (dto.agentId) await this.assertAgentExists(dto.agentId);
    const result = await this.prisma.tenant.knowledgeBase.updateMany({
      where: { id },
      data: {
        name: dto.name,
        status: dto.status,
        ...(dto.agentId !== undefined ? { agentId: dto.agentId } : {}),
      },
    });
    if (result.count === 0) throw Problems.notFound("Knowledge base not found.");
    await this.audit.record({
      organizationId,
      actorId: principal.userId,
      action: "knowledge_base.update",
      targetType: "KnowledgeBase",
      targetId: id,
      ip: ctx.ip,
    });
    return toKnowledgeBaseDto(await this.loadBase(id));
  }

  async deleteBase(
    principal: UserPrincipal,
    organizationId: string,
    id: string,
    ctx: RequestMeta,
  ): Promise<void> {
    await this.loadBase(id);
    // Remove retrievable chunks and soft-delete the documents + the base.
    await this.prisma.tenant.knowledgeChunk.deleteMany({ where: { knowledgeBaseId: id } });
    await this.prisma.tenant.knowledgeDocument.updateMany({
      where: { knowledgeBaseId: id },
      data: { deletedAt: new Date() },
    });
    await this.prisma.tenant.knowledgeBase.updateMany({
      where: { id },
      data: { deletedAt: new Date(), status: "DISABLED" },
    });
    await this.audit.record({
      organizationId,
      actorId: principal.userId,
      action: "knowledge_base.delete",
      targetType: "KnowledgeBase",
      targetId: id,
      ip: ctx.ip,
    });
  }

  // --- Documents ---

  async listDocuments(kbId: string, query: PaginationQuery): Promise<Page<KnowledgeDocumentDto>> {
    await this.loadBase(kbId);
    const take = query.limit;
    const rows = await this.prisma.tenant.knowledgeDocument.findMany({
      where: { knowledgeBaseId: kbId },
      include: { _count: { select: { chunks: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > take;
    const page = hasNextPage ? rows.slice(0, take) : rows;
    return {
      data: page.map((doc) => toKnowledgeDocumentDto(doc, doc._count.chunks)),
      pageInfo: { nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null, hasNextPage },
    };
  }

  async getDocument(kbId: string, docId: string): Promise<KnowledgeDocumentDto> {
    await this.loadBase(kbId);
    const doc = await this.prisma.tenant.knowledgeDocument.findFirst({
      where: { id: docId, knowledgeBaseId: kbId },
      include: { _count: { select: { chunks: true } } },
    });
    if (!doc) throw Problems.notFound("Document not found.");
    return toKnowledgeDocumentDto(doc, doc._count.chunks);
  }

  async createDocument(
    principal: UserPrincipal,
    organizationId: string,
    kbId: string,
    dto: CreateKnowledgeDocumentRequest,
    ctx: RequestMeta,
  ): Promise<KnowledgeDocumentDto> {
    await this.loadBase(kbId);
    const doc = await this.prisma.tenant.knowledgeDocument.create({
      data: {
        organizationId,
        knowledgeBaseId: kbId,
        title: dto.title,
        sourceType: dto.sourceType,
        content: dto.content,
        bytes: Buffer.byteLength(dto.content, "utf8"),
        checksum: createHash("sha256").update(dto.content).digest("hex"),
        status: "PENDING",
      },
    });

    await this.audit.record({
      organizationId,
      actorId: principal.userId,
      action: "knowledge_document.create",
      targetType: "KnowledgeDocument",
      targetId: doc.id,
      metadata: { knowledgeBaseId: kbId, title: dto.title },
      ip: ctx.ip,
    });

    try {
      await this.ingestion.enqueueEmbedding({
        documentId: doc.id,
        knowledgeBaseId: kbId,
        organizationId,
      });
    } catch (error) {
      this.logger.error(`Failed to enqueue ingestion for ${doc.id}: ${String(error)}`);
      await this.prisma.tenant.knowledgeDocument.updateMany({
        where: { id: doc.id },
        data: { status: "FAILED", error: "Could not enqueue ingestion job (queue unavailable)." },
      });
      return toKnowledgeDocumentDto(
        { ...doc, status: "FAILED", error: "Could not enqueue ingestion job (queue unavailable)." },
        0,
      );
    }

    return toKnowledgeDocumentDto(doc, 0);
  }

  async deleteDocument(
    principal: UserPrincipal,
    organizationId: string,
    kbId: string,
    docId: string,
    ctx: RequestMeta,
  ): Promise<void> {
    const doc = await this.prisma.tenant.knowledgeDocument.findFirst({
      where: { id: docId, knowledgeBaseId: kbId },
    });
    if (!doc) throw Problems.notFound("Document not found.");
    await this.prisma.tenant.knowledgeChunk.deleteMany({ where: { documentId: docId } });
    await this.prisma.tenant.knowledgeDocument.updateMany({
      where: { id: docId },
      data: { deletedAt: new Date() },
    });
    await this.audit.record({
      organizationId,
      actorId: principal.userId,
      action: "knowledge_document.delete",
      targetType: "KnowledgeDocument",
      targetId: docId,
      ip: ctx.ip,
    });
  }

  // --- Retrieval ---

  async query(kbId: string, dto: RetrievalQueryRequest): Promise<RetrievalResponse> {
    await this.loadBase(kbId);
    const [queryVector] = await this.embedding.embed([dto.query]);
    if (!queryVector) {
      return { query: dto.query, results: [] };
    }

    const chunks = await this.prisma.tenant.knowledgeChunk.findMany({
      where: { knowledgeBaseId: kbId, embeddingModel: this.embedding.model },
      select: { id: true, documentId: true, ordinal: true, content: true, embedding: true },
    });

    const ranked = chunks
      .map((chunk) => ({ chunk, score: cosineSimilarity(queryVector, chunk.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, dto.topK);

    const documentIds = [...new Set(ranked.map((r) => r.chunk.documentId))];
    const documents = await this.prisma.tenant.knowledgeDocument.findMany({
      where: { id: { in: documentIds } },
      select: { id: true, title: true },
    });
    const titleById = new Map(documents.map((d) => [d.id, d.title]));

    return {
      query: dto.query,
      results: ranked.map(({ chunk, score }) => ({
        chunkId: chunk.id,
        documentId: chunk.documentId,
        documentTitle: titleById.get(chunk.documentId) ?? "",
        ordinal: chunk.ordinal,
        content: chunk.content,
        score,
      })),
    };
  }

  private async loadBase(id: string) {
    const kb = await this.prisma.tenant.knowledgeBase.findFirst({ where: { id } });
    if (!kb) throw Problems.notFound("Knowledge base not found.");
    return kb;
  }

  private async assertAgentExists(agentId: string): Promise<void> {
    const agent = await this.prisma.tenant.agent.findFirst({ where: { id: agentId } });
    if (!agent) throw Problems.unprocessable("The referenced agent does not exist.");
  }
}
