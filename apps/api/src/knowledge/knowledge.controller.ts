import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import {
  createKnowledgeBaseRequestSchema,
  createKnowledgeDocumentRequestSchema,
  paginationQuerySchema,
  retrievalQueryRequestSchema,
  updateKnowledgeBaseRequestSchema,
  type CreateKnowledgeBaseRequest,
  type CreateKnowledgeDocumentRequest,
  type KnowledgeBaseDto,
  type KnowledgeDocumentDto,
  type PaginationQuery,
  type RetrievalQueryRequest,
  type RetrievalResponse,
  type UpdateKnowledgeBaseRequest,
} from "@ovozai/contracts";
import { CurrentPrincipal } from "../common/current-principal.decorator";
import { Roles } from "../common/roles.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { requestContextFrom } from "../common/request-context";
import type { RequestWithContext, UserPrincipal } from "../common/principal.types";
import { KnowledgeService } from "./knowledge.service";

@Controller("knowledge-bases")
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get()
  @Roles("VIEWER")
  list(@Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery) {
    return this.knowledge.listBases(query);
  }

  @Post()
  @Roles("MEMBER")
  create(
    @CurrentPrincipal() principal: UserPrincipal,
    @Body(new ZodValidationPipe(createKnowledgeBaseRequestSchema)) body: CreateKnowledgeBaseRequest,
    @Req() req: RequestWithContext,
  ): Promise<KnowledgeBaseDto> {
    return this.knowledge.createBase(principal, principal.organizationId as string, body, requestContextFrom(req));
  }

  @Get(":id/documents")
  @Roles("VIEWER")
  listDocuments(
    @Param("id") id: string,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ) {
    return this.knowledge.listDocuments(id, query);
  }

  @Post(":id/documents")
  @Roles("MEMBER")
  createDocument(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createKnowledgeDocumentRequestSchema)) body: CreateKnowledgeDocumentRequest,
    @Req() req: RequestWithContext,
  ): Promise<KnowledgeDocumentDto> {
    return this.knowledge.createDocument(
      principal,
      principal.organizationId as string,
      id,
      body,
      requestContextFrom(req),
    );
  }

  @Get(":id/documents/:docId")
  @Roles("VIEWER")
  getDocument(@Param("id") id: string, @Param("docId") docId: string): Promise<KnowledgeDocumentDto> {
    return this.knowledge.getDocument(id, docId);
  }

  @Delete(":id/documents/:docId")
  @Roles("MEMBER")
  @HttpCode(204)
  deleteDocument(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
    @Param("docId") docId: string,
    @Req() req: RequestWithContext,
  ): Promise<void> {
    return this.knowledge.deleteDocument(
      principal,
      principal.organizationId as string,
      id,
      docId,
      requestContextFrom(req),
    );
  }

  @Post(":id/query")
  @Roles("VIEWER")
  @HttpCode(200)
  query(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(retrievalQueryRequestSchema)) body: RetrievalQueryRequest,
  ): Promise<RetrievalResponse> {
    return this.knowledge.query(id, body);
  }

  @Get(":id")
  @Roles("VIEWER")
  get(@Param("id") id: string): Promise<KnowledgeBaseDto> {
    return this.knowledge.getBase(id);
  }

  @Patch(":id")
  @Roles("MEMBER")
  update(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateKnowledgeBaseRequestSchema)) body: UpdateKnowledgeBaseRequest,
    @Req() req: RequestWithContext,
  ): Promise<KnowledgeBaseDto> {
    return this.knowledge.updateBase(principal, principal.organizationId as string, id, body, requestContextFrom(req));
  }

  @Delete(":id")
  @Roles("ADMIN")
  @HttpCode(204)
  remove(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithContext,
  ): Promise<void> {
    return this.knowledge.deleteBase(principal, principal.organizationId as string, id, requestContextFrom(req));
  }
}
