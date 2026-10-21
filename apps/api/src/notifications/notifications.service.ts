import { Inject, Injectable, Logger } from "@nestjs/common";
import type { NotificationProvider } from "@ovozai/integrations";
import type { NotificationChannel, NotificationDto, NotificationListQuery } from "@ovozai/contracts";
import { toNotificationDto } from "../common/mappers";
import { PrismaService } from "../prisma/prisma.service";
import { NOTIFICATION_PROVIDER } from "./notification.provider";

interface Page<T> {
  data: T[];
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
}

export interface DispatchNotification {
  event: string;
  channel?: NotificationChannel;
  recipient?: string;
  subject?: string;
  body: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_PROVIDER) private readonly provider: NotificationProvider,
  ) {}

  async list(query: NotificationListQuery): Promise<Page<NotificationDto>> {
    const where: { event?: string; status?: NotificationListQuery["status"] } = {};
    if (query.event) where.event = query.event;
    if (query.status) where.status = query.status;
    const take = query.limit;
    const rows = await this.prisma.tenant.notification.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > take;
    const page = hasNextPage ? rows.slice(0, take) : rows;
    return {
      data: page.map(toNotificationDto),
      pageInfo: { nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null, hasNextPage },
    };
  }

  /**
   * Persist + send a notification for `organizationId`. Uses the base client with
   * an explicit org so it is callable from request handlers and the internal
   * channel alike. Best-effort: delivery failure is logged, not thrown.
   */
  async dispatch(organizationId: string, params: DispatchNotification): Promise<void> {
    const channel = params.channel ?? "IN_APP";
    const notification = await this.prisma.base.notification.create({
      data: {
        organizationId,
        channel,
        event: params.event,
        recipient: params.recipient,
        subject: params.subject,
        body: params.body,
        status: "PENDING",
      },
    });
    try {
      const result = await this.provider.send({
        channel,
        recipient: params.recipient,
        subject: params.subject,
        body: params.body,
      });
      await this.prisma.base.notification.update({
        where: { id: notification.id },
        data: { status: result.delivered ? "SENT" : "FAILED", sentAt: result.delivered ? new Date() : null },
      });
    } catch (error) {
      this.logger.warn(`Notification ${notification.id} delivery failed: ${String(error)}`);
      await this.prisma.base.notification.update({
        where: { id: notification.id },
        data: { status: "FAILED" },
      });
    }
  }
}
