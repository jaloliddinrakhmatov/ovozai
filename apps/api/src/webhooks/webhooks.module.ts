import { Module } from "@nestjs/common";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksService } from "./webhooks.service";
import { WebhookQueue } from "./webhook.queue";

@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookQueue],
  exports: [WebhooksService],
})
export class WebhooksModule {}
