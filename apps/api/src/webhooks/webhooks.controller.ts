import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import {
  createWebhookEndpointRequestSchema,
  paginationQuerySchema,
  updateWebhookEndpointRequestSchema,
  webhookDeliveryListQuerySchema,
  type CreateWebhookEndpointRequest,
  type PaginationQuery,
  type UpdateWebhookEndpointRequest,
  type WebhookDeliveryListQuery,
  type WebhookEndpointCreatedDto,
  type WebhookEndpointDto,
} from "@ovozai/contracts";
import { CurrentPrincipal } from "../common/current-principal.decorator";
import { Roles } from "../common/roles.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { requestContextFrom } from "../common/request-context";
import type { RequestWithContext, UserPrincipal } from "../common/principal.types";
import { WebhooksService } from "./webhooks.service";

@Controller("webhooks")
@Roles("ADMIN")
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get("endpoints")
  listEndpoints(@Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery) {
    return this.webhooks.listEndpoints(query);
  }

  @Post("endpoints")
  createEndpoint(
    @CurrentPrincipal() principal: UserPrincipal,
    @Body(new ZodValidationPipe(createWebhookEndpointRequestSchema)) body: CreateWebhookEndpointRequest,
    @Req() req: RequestWithContext,
  ): Promise<WebhookEndpointCreatedDto> {
    return this.webhooks.createEndpoint(principal, principal.organizationId as string, body, requestContextFrom(req));
  }

  @Patch("endpoints/:id")
  updateEndpoint(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateWebhookEndpointRequestSchema)) body: UpdateWebhookEndpointRequest,
    @Req() req: RequestWithContext,
  ): Promise<WebhookEndpointDto> {
    return this.webhooks.updateEndpoint(principal, principal.organizationId as string, id, body, requestContextFrom(req));
  }

  @Delete("endpoints/:id")
  @HttpCode(204)
  deleteEndpoint(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithContext,
  ): Promise<void> {
    return this.webhooks.deleteEndpoint(principal, principal.organizationId as string, id, requestContextFrom(req));
  }

  @Get("deliveries")
  listDeliveries(@Query(new ZodValidationPipe(webhookDeliveryListQuerySchema)) query: WebhookDeliveryListQuery) {
    return this.webhooks.listDeliveries(query);
  }
}
