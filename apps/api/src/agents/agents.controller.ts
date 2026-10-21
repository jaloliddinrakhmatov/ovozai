import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import {
  createAgentRequestSchema,
  paginationQuerySchema,
  updateAgentRequestSchema,
  type AgentDto,
  type AgentVersionDto,
  type CreateAgentRequest,
  type PaginationQuery,
  type UpdateAgentRequest,
} from "@ovozai/contracts";
import { CurrentPrincipal } from "../common/current-principal.decorator";
import { Roles } from "../common/roles.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { requestContextFrom } from "../common/request-context";
import { Problems } from "../common/problem.exception";
import type { RequestWithContext, UserPrincipal } from "../common/principal.types";
import { AgentsService } from "./agents.service";

@Controller("agents")
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get()
  @Roles("VIEWER")
  list(@Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery) {
    return this.agents.list(query);
  }

  @Post()
  @Roles("ADMIN")
  create(
    @CurrentPrincipal() principal: UserPrincipal,
    @Body(new ZodValidationPipe(createAgentRequestSchema)) body: CreateAgentRequest,
    @Req() req: RequestWithContext,
  ): Promise<AgentDto> {
    return this.agents.create(principal, principal.organizationId as string, body, requestContextFrom(req));
  }

  @Post(":id/publish")
  @Roles("ADMIN")
  publish(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithContext,
  ): Promise<AgentVersionDto> {
    return this.agents.publish(principal, principal.organizationId as string, id, requestContextFrom(req));
  }

  @Get(":id/versions")
  @Roles("VIEWER")
  listVersions(
    @Param("id") id: string,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ) {
    return this.agents.listVersions(id, query);
  }

  @Post(":id/versions/:version/restore")
  @Roles("ADMIN")
  @HttpCode(200)
  restoreVersion(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
    @Param("version") version: string,
    @Req() req: RequestWithContext,
  ): Promise<AgentDto> {
    const parsed = Number(version);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw Problems.unprocessable("Version must be a positive integer.");
    }
    return this.agents.restoreVersion(
      principal,
      principal.organizationId as string,
      id,
      parsed,
      requestContextFrom(req),
    );
  }

  @Get(":id")
  @Roles("VIEWER")
  get(@Param("id") id: string): Promise<AgentDto> {
    return this.agents.get(id);
  }

  @Patch(":id")
  @Roles("ADMIN")
  update(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateAgentRequestSchema)) body: UpdateAgentRequest,
    @Req() req: RequestWithContext,
  ): Promise<AgentDto> {
    return this.agents.update(principal, principal.organizationId as string, id, body, requestContextFrom(req));
  }

  @Delete(":id")
  @Roles("ADMIN")
  @HttpCode(204)
  remove(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithContext,
  ): Promise<void> {
    return this.agents.softDelete(principal, principal.organizationId as string, id, requestContextFrom(req));
  }
}
