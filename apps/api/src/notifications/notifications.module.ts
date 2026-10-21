import { Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { notificationProvider } from "./notification.provider";

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, notificationProvider],
  exports: [NotificationsService],
})
export class NotificationsModule {}
