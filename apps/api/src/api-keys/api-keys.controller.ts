import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import {
  createApiKeyRequestSchema,
  paginationQuerySchema,
  type ApiKeyCreatedDto,
  type CreateApiKeyRequest,
  type PaginationQuery,
} from "@ovozai/contracts";
import { CurrentPrincipal } from "../common/current-principal.decorator";
import { Roles } from "../common/roles.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { RequestWithContext, UserPrincipal } from "../common/principal.types";
import { ApiKeysService } from "./api-keys.service";

function contextFrom(req: RequestWithContext) {
  const userAgent = req.headers["user-agent"];
  return { userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent, ip: req.ip };
}

@Controller("api-keys")
@Roles("ADMIN")
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  list(@Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery) {
    return this.apiKeys.list(query);
  }

  @Post()
  create(
    @CurrentPrincipal() principal: UserPrincipal,
    @Body(new ZodValidationPipe(createApiKeyRequestSchema)) body: CreateApiKeyRequest,
    @Req() req: RequestWithContext,
  ): Promise<ApiKeyCreatedDto> {
    return this.apiKeys.create(principal, principal.organizationId as string, body, contextFrom(req));
  }

  @Delete(":id")
  @HttpCode(204)
  revoke(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithContext,
  ): Promise<void> {
    return this.apiKeys.revoke(principal, principal.organizationId as string, id, contextFrom(req));
  }
}
