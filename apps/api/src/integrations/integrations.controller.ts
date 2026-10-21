import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import {
  createIntegrationRequestSchema,
  paginationQuerySchema,
  type CreateIntegrationRequest,
  type IntegrationDto,
  type PaginationQuery,
} from "@ovozai/contracts";
import { CurrentPrincipal } from "../common/current-principal.decorator";
import { Roles } from "../common/roles.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { requestContextFrom } from "../common/request-context";
import type { RequestWithContext, UserPrincipal } from "../common/principal.types";
import { IntegrationsService } from "./integrations.service";

@Controller("integrations")
@Roles("ADMIN")
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery) {
    return this.integrations.list(query);
  }

  @Post()
  connect(
    @CurrentPrincipal() principal: UserPrincipal,
    @Body(new ZodValidationPipe(createIntegrationRequestSchema)) body: CreateIntegrationRequest,
    @Req() req: RequestWithContext,
  ): Promise<IntegrationDto> {
    return this.integrations.connect(principal, principal.organizationId as string, body, requestContextFrom(req));
  }

  @Delete(":id")
  @HttpCode(204)
  disconnect(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithContext,
  ): Promise<void> {
    return this.integrations.disconnect(principal, principal.organizationId as string, id, requestContextFrom(req));
  }
}
