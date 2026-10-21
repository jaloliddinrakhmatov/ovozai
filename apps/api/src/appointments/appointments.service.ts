import { Injectable } from "@nestjs/common";
import { Prisma } from "@ovozai/database";
import type {
  AppointmentDto,
  AppointmentListQuery,
  CreateAppointmentRequest,
  UpdateAppointmentRequest,
} from "@ovozai/contracts";
import { AuditService } from "../audit/audit.service";
import { Problems } from "../common/problem.exception";
import { toAppointmentDto } from "../common/mappers";
import type { RequestMeta } from "../common/request-context";
import type { UserPrincipal } from "../common/principal.types";
import { PrismaService } from "../prisma/prisma.service";
import { IntegrationsService } from "../integrations/integrations.service";
import { NotificationsService } from "../notifications/notifications.service";
import { WebhooksService } from "../webhooks/webhooks.service";

interface Page<T> {
  data: T[];
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
}

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly integrations: IntegrationsService,
    private readonly notifications: NotificationsService,
    private readonly webhooks: WebhooksService,
  ) {}

  async list(query: AppointmentListQuery): Promise<Page<AppointmentDto>> {
    const where: Prisma.AppointmentWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.customerId) where.customerId = query.customerId;
    if (query.from || query.to) {
      where.startsAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lt: new Date(query.to) } : {}),
      };
    }

    const take = query.limit;
    const rows = await this.prisma.tenant.appointment.findMany({
      where,
      orderBy: [{ startsAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > take;
    const page = hasNextPage ? rows.slice(0, take) : rows;
    return {
      data: page.map(toAppointmentDto),
      pageInfo: { nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null, hasNextPage },
    };
  }

  async get(id: string): Promise<AppointmentDto> {
    return toAppointmentDto(await this.load(id));
  }

  async create(
    principal: UserPrincipal,
    organizationId: string,
    dto: CreateAppointmentRequest,
    ctx: RequestMeta,
  ): Promise<AppointmentDto> {
    await this.assertCustomerExists(dto.customerId);
    if (dto.agentId) await this.assertAgentExists(dto.agentId);

    const appointment = await this.prisma.tenant.appointment.create({
      data: {
        organizationId,
        customerId: dto.customerId,
        agentId: dto.agentId ?? null,
        title: dto.title,
        notes: dto.notes,
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      },
    });
    await this.audit.record({
      organizationId,
      actorId: principal.userId,
      action: "appointment.create",
      targetType: "Appointment",
      targetId: appointment.id,
      ip: ctx.ip,
    });

    const externalCalendarId = await this.integrations.syncAppointmentToCalendar(organizationId, {
      title: dto.title,
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
    });
    if (externalCalendarId) {
      await this.prisma.tenant.appointment.updateMany({
        where: { id: appointment.id },
        data: { externalCalendarId },
      });
    }
    await this.notifications
      .dispatch(organizationId, {
        event: "appointment.created",
        channel: "IN_APP",
        body: `Appointment "${dto.title}" booked for ${dto.startsAt}.`,
      })
      .catch(() => undefined);
    await this.webhooks
      .dispatch(organizationId, "appointment.created", {
        appointmentId: appointment.id,
        startsAt: dto.startsAt,
      })
      .catch(() => undefined);

    return toAppointmentDto({ ...appointment, externalCalendarId: externalCalendarId ?? appointment.externalCalendarId });
  }

  async update(
    principal: UserPrincipal,
    organizationId: string,
    id: string,
    dto: UpdateAppointmentRequest,
    ctx: RequestMeta,
  ): Promise<AppointmentDto> {
    await this.load(id);
    if (dto.agentId) await this.assertAgentExists(dto.agentId);

    const result = await this.prisma.tenant.appointment.updateMany({
      where: { id },
      data: {
        title: dto.title,
        notes: dto.notes,
        status: dto.status,
        ...(dto.startsAt !== undefined ? { startsAt: new Date(dto.startsAt) } : {}),
        ...(dto.endsAt !== undefined ? { endsAt: dto.endsAt ? new Date(dto.endsAt) : null } : {}),
        ...(dto.agentId !== undefined ? { agentId: dto.agentId } : {}),
      },
    });
    if (result.count === 0) throw Problems.notFound("Appointment not found.");
    await this.audit.record({
      organizationId,
      actorId: principal.userId,
      action: "appointment.update",
      targetType: "Appointment",
      targetId: id,
      metadata: dto.status ? { status: dto.status } : undefined,
      ip: ctx.ip,
    });
    return toAppointmentDto(await this.load(id));
  }

  /** Cancel an appointment (sets status CANCELED; appointments are not deleted). */
  async cancel(
    principal: UserPrincipal,
    organizationId: string,
    id: string,
    ctx: RequestMeta,
  ): Promise<void> {
    const result = await this.prisma.tenant.appointment.updateMany({
      where: { id },
      data: { status: "CANCELED" },
    });
    if (result.count === 0) throw Problems.notFound("Appointment not found.");
    await this.audit.record({
      organizationId,
      actorId: principal.userId,
      action: "appointment.cancel",
      targetType: "Appointment",
      targetId: id,
      ip: ctx.ip,
    });
  }

  private async load(id: string) {
    const appointment = await this.prisma.tenant.appointment.findFirst({ where: { id } });
    if (!appointment) throw Problems.notFound("Appointment not found.");
    return appointment;
  }

  private async assertCustomerExists(customerId: string): Promise<void> {
    const customer = await this.prisma.tenant.customer.findFirst({ where: { id: customerId } });
    if (!customer) throw Problems.unprocessable("The referenced customer does not exist.");
  }

  private async assertAgentExists(agentId: string): Promise<void> {
    const agent = await this.prisma.tenant.agent.findFirst({ where: { id: agentId } });
    if (!agent) throw Problems.unprocessable("The referenced agent does not exist.");
  }
}
