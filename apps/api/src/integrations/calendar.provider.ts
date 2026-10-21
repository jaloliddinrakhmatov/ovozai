import type { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCalendarProvider, type CalendarProvider } from "@ovozai/integrations";

export const CALENDAR_PROVIDER = Symbol("CALENDAR_PROVIDER");

export const calendarProvider: Provider = {
  provide: CALENDAR_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService): CalendarProvider =>
    createCalendarProvider({ provider: config.get<"mock" | "google">("CALENDAR_PROVIDER") ?? "mock" }),
};
