import { Inject, Injectable, Logger } from "@nestjs/common";
import type { CalendarProvider } from "@ovozai/integrations";
import type { CreateIntegrationRequest, IntegrationDto, PaginationQuery } from "@ovozai/contracts";
import { Prisma } from "@ovozai/database";
import { AuditService } from "../audit/audit.service";
import { Problems } from "../common/problem.exception";
import { toIntegrationDto } from "../common/mappers";
import type { RequestMeta } from "../common/request-context";
import type { UserPrincipal } from "../common/principal.types";
import { PrismaService } from "../prisma/prisma.service";
import { CALENDAR_PROVIDER } from "./calendar.provider";

interface Page<T> {
  data: T[];
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
}

export interface CalendarSyncInput {
  title: string;
  startsAt: string;
  endsAt?: string;
  customerName?: string;
}

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(CALENDAR_PROVIDER) private readonly calendar: CalendarProvider,
  ) {}

  async list(query: PaginationQuery): Promise<Page<IntegrationDto>> {
    const take = query.limit;
    const rows = await this.prisma.tenant.integration.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > take;
    const page = hasNextPage ? rows.slice(0, take) : rows;
    return {
      data: page.map(toIntegrationDto),
      pageInfo: { nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null, hasNextPage },
    };
  }

  async connect(
    principal: UserPrincipal,
    organizationId: string,
    dto: CreateIntegrationRequest,
    ctx: RequestMeta,
  ): Promise<IntegrationDto> {
    // The API key (if supplied) is never persisted in the clear: a reference is
    // stored (prod resolves it from the secret store — docs/SECURITY.md §5).
    const secretRef = dto.apiKey ? `secret:${dto.type.toLowerCase()}:${dto.provider}` : null;
    const integration = await this.prisma.tenant.integration.create({
      data: {
        organizationId,
        type: dto.type,
        provider: dto.provider,
        status: "CONNECTED",
        config: (dto.config ?? {}) as Prisma.InputJsonValue,
        secretRef,
      },
    });
    await this.audit.record({
      organizationId,
      actorId: principal.userId,
      action: "integration.connect",
      targetType: "Integration",
      targetId: integration.id,
      metadata: { type: dto.type, provider: dto.provider },
      ip: ctx.ip,
    });
    return toIntegrationDto(integration);
  }

  async disconnect(
    principal: UserPrincipal,
    organizationId: string,
    id: string,
    ctx: RequestMeta,
  ): Promise<void> {
    const result = await this.prisma.tenant.integration.updateMany({
      where: { id },
      data: { status: "DISCONNECTED", deletedAt: new Date() },
    });
    if (result.count === 0) throw Problems.notFound("Integration not found.");
    await this.audit.record({
      organizationId,
      actorId: principal.userId,
      action: "integration.disconnect",
      targetType: "Integration",
      targetId: id,
      ip: ctx.ip,
    });
  }

  /**
   * Sync an appointment to the org's connected calendar, returning the external
   * event id (or null if no calendar is connected). Best-effort; base client +
   * explicit org so it is callable from request + internal contexts.
   */
  async syncAppointmentToCalendar(organizationId: string, input: CalendarSyncInput): Promise<string | null> {
    const integration = await this.prisma.base.integration.findFirst({
      where: { organizationId, type: "CALENDAR", status: "CONNECTED", deletedAt: null },
    });
    if (!integration) return null;
    try {
      const result = await this.calendar.createEvent({ organizationId, ...input });
      return result.externalEventId;
    } catch (error) {
      this.logger.warn(`Calendar sync failed for org ${organizationId}: ${String(error)}`);
      return null;
    }
  }
}
