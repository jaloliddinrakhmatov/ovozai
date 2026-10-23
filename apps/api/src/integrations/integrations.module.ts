import { Module } from "@nestjs/common";
import { IntegrationsController } from "./integrations.controller";
import { GoogleCalendarController } from "./google-calendar.controller";
import { IntegrationsService } from "./integrations.service";
import { calendarProvider } from "./calendar.provider";

@Module({
  controllers: [IntegrationsController, GoogleCalendarController],
  providers: [IntegrationsService, calendarProvider],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
