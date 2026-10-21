import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@ovozai/database";
import type {
  CreateWebhookEndpointRequest,
  UpdateWebhookEndpointRequest,
  WebhookDeliveryDto,
  WebhookDeliveryListQuery,
  WebhookEndpointCreatedDto,
  WebhookEndpointDto,
  PaginationQuery,
} from "@ovozai/contracts";
import { AuditService } from "../audit/audit.service";
import { Problems } from "../common/problem.exception";
import { toWebhookDeliveryDto, toWebhookEndpointDto } from "../common/mappers";
import { randomToken } from "../auth/crypto.util";
import type { RequestMeta } from "../common/request-context";
import type { UserPrincipal } from "../common/principal.types";
import { PrismaService } from "../prisma/prisma.service";
import { WebhookQueue } from "./webhook.queue";

interface Page<T> {
  data: T[];
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly queue: WebhookQueue,
  ) {}

  // --- Endpoint management (user JWT → tenant client) ---

  async listEndpoints(query: PaginationQuery): Promise<Page<WebhookEndpointDto>> {
    const take = query.limit;
    const rows = await this.prisma.tenant.webhookEndpoint.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > take;
    const page = hasNextPage ? rows.slice(0, take) : rows;
    return {
      data: page.map(toWebhookEndpointDto),
      pageInfo: { nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null, hasNextPage },
    };
  }

  async createEndpoint(
    principal: UserPrincipal,
    organizationId: string,
    dto: CreateWebhookEndpointRequest,
    ctx: RequestMeta,
  ): Promise<WebhookEndpointCreatedDto> {
    const secret = `whsec_${randomToken(24)}`;
    const endpoint = await this.prisma.tenant.webhookEndpoint.create({
      data: { organizationId, url: dto.url, events: dto.events, secret, status: "ACTIVE" },
    });
    await this.audit.record({
      organizationId,
      actorId: principal.userId,
      action: "webhook.endpoint_created",
      targetType: "WebhookEndpoint",
      targetId: endpoint.id,
      metadata: { url: dto.url, events: dto.events },
      ip: ctx.ip,
    });
    return { ...toWebhookEndpointDto(endpoint), secret };
  }

  async updateEndpoint(
    principal: UserPrincipal,
    organizationId: string,
    id: string,
    dto: UpdateWebhookEndpointRequest,
    ctx: RequestMeta,
  ): Promise<WebhookEndpointDto> {
    const existing = await this.prisma.tenant.webhookEndpoint.findFirst({ where: { id } });
    if (!existing) throw Problems.notFound("Webhook endpoint not found.");
    const result = await this.prisma.tenant.webhookEndpoint.updateMany({
      where: { id },
      data: { url: dto.url, events: dto.events, status: dto.status },
    });
    if (result.count === 0) throw Problems.notFound("Webhook endpoint not found.");
    await this.audit.record({
      organizationId,
      actorId: principal.userId,
      action: "webhook.endpoint_updated",
      targetType: "WebhookEndpoint",
      targetId: id,
      ip: ctx.ip,
    });
    const updated = await this.prisma.tenant.webhookEndpoint.findFirst({ where: { id } });
    return toWebhookEndpointDto(updated ?? existing);
  }

  async deleteEndpoint(
    principal: UserPrincipal,
    organizationId: string,
    id: string,
    ctx: RequestMeta,
  ): Promise<void> {
    const result = await this.prisma.tenant.webhookEndpoint.updateMany({
      where: { id },
      data: { deletedAt: new Date(), status: "DISABLED" },
    });
    if (result.count === 0) throw Problems.notFound("Webhook endpoint not found.");
    await this.audit.record({
      organizationId,
      actorId: principal.userId,
      action: "webhook.endpoint_deleted",
      targetType: "WebhookEndpoint",
      targetId: id,
      ip: ctx.ip,
    });
  }

  async listDeliveries(query: WebhookDeliveryListQuery): Promise<Page<WebhookDeliveryDto>> {
    const where: Prisma.WebhookDeliveryWhereInput = {};
    if (query.endpointId) where.endpointId = query.endpointId;
    if (query.status) where.status = query.status;
    const take = query.limit;
    const rows = await this.prisma.tenant.webhookDelivery.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > take;
    const page = hasNextPage ? rows.slice(0, take) : rows;
    return {
      data: page.map(toWebhookDeliveryDto),
      pageInfo: { nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null, hasNextPage },
    };
  }

  // --- Dispatch (internal/system → base client with explicit org) ---

  /** Fan an event out to the org's subscribed, active endpoints and enqueue delivery. */
  async dispatch(
    organizationId: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const endpoints = await this.prisma.base.webhookEndpoint.findMany({
      where: { organizationId, status: "ACTIVE", deletedAt: null, events: { has: event } },
    });
    for (const endpoint of endpoints) {
      try {
        const delivery = await this.prisma.base.webhookDelivery.create({
          data: {
            organizationId,
            endpointId: endpoint.id,
            event,
            payload: payload as Prisma.InputJsonValue,
            status: "PENDING",
          },
        });
        await this.queue.enqueue({ deliveryId: delivery.id, organizationId });
      } catch (error) {
        this.logger.error(`Failed to dispatch ${event} to ${endpoint.id}: ${String(error)}`);
      }
    }
  }
}
