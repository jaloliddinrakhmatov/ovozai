import { Module } from "@nestjs/common";
import { WebhooksModule } from "../webhooks/webhooks.module";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { PlanLimitsService } from "./plan-limits.service";
import { paymentProvider } from "./payment.provider";
import { UsageRollupQueue } from "./usage-rollup.queue";

@Module({
  imports: [WebhooksModule],
  controllers: [BillingController],
  providers: [BillingService, PlanLimitsService, paymentProvider, UsageRollupQueue],
  exports: [PlanLimitsService],
})
export class BillingModule {}
