import { Controller, Get, Query } from "@nestjs/common";
import { notificationListQuerySchema, type NotificationListQuery } from "@ovozai/contracts";
import { Roles } from "../common/roles.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Roles("VIEWER")
  list(@Query(new ZodValidationPipe(notificationListQuerySchema)) query: NotificationListQuery) {
    return this.notifications.list(query);
  }
}
