import type { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createNotificationProvider, type NotificationProvider } from "@ovozai/integrations";

export const NOTIFICATION_PROVIDER = Symbol("NOTIFICATION_PROVIDER");

export const notificationProvider: Provider = {
  provide: NOTIFICATION_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService): NotificationProvider =>
    createNotificationProvider({
      provider: config.get<"mock" | "external">("NOTIFICATION_PROVIDER") ?? "mock",
    }),
};
