import { Module } from "@nestjs/common";
import { embeddingProvider } from "../knowledge/embedding.provider";
import { WebhooksModule } from "../webhooks/webhooks.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { InternalAuthGuard } from "./internal-auth.guard";
import { InternalController } from "./internal.controller";
import { InternalService } from "./internal.service";

@Module({
  imports: [WebhooksModule, IntegrationsModule, NotificationsModule],
  controllers: [InternalController],
  providers: [InternalService, InternalAuthGuard, embeddingProvider],
})
export class InternalModule {}
