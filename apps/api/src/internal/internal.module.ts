import { Module } from "@nestjs/common";
import { embeddingProvider } from "../knowledge/embedding.provider";
import { WebhooksModule } from "../webhooks/webhooks.module";
import { InternalAuthGuard } from "./internal-auth.guard";
import { InternalController } from "./internal.controller";
import { InternalService } from "./internal.service";

@Module({
  imports: [WebhooksModule],
  controllers: [InternalController],
  providers: [InternalService, InternalAuthGuard, embeddingProvider],
})
export class InternalModule {}
