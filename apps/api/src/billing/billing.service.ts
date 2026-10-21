import { Inject, Injectable } from "@nestjs/common";
import type { PaymentProvider } from "@ovozai/integrations";
import type {
  CreateSubscriptionRequest,
  PlanDto,
  SubscriptionDto,
  UsageMetric,
  UsageSummaryItem,
  UsageSummaryResponse,
} from "@ovozai/contracts";
import { AuditService } from "../audit/audit.service";
import { Problems } from "../common/problem.exception";
import { toPlanDto, toSubscriptionDto } from "../common/mappers";
import type { RequestMeta } from "../common/request-context";
import type { UserPrincipal } from "../common/principal.types";
import { PrismaService } from "../prisma/prisma.service";
import { WebhooksService } from "../webhooks/webhooks.service";
import { PAYMENT_PROVIDER } from "./payment.provider";
import { UsageRollupQueue } from "./usage-rollup.queue";

function currentPeriodKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService,
    private readonly rollupQueue: UsageRollupQueue,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
  ) {}

  async listPlans(): Promise<PlanDto[]> {
    const plans = await this.prisma.base.plan.findMany({
      where: { active: true },
      orderBy: { priceCents: "asc" },
    });
    return plans.map(toPlanDto);
  }

  async getSubscription(): Promise<SubscriptionDto | null> {
    const subscription = await this.prisma.tenant.subscription.findFirst({ include: { plan: true } });
    return subscription ? toSubscriptionDto(subscription) : null;
  }

  async subscribe(
    principal: UserPrincipal,
    organizationId: string,
    dto: CreateSubscriptionRequest,
    ctx: RequestMeta,
  ): Promise<SubscriptionDto> {
    const plan = await this.prisma.base.plan.findFirst({ where: { code: dto.planCode, active: true } });
    if (!plan) {
      throw Problems.unprocessable("Unknown plan.");
    }

    const result = await this.payments.subscribe({
      organizationId,
      planCode: plan.code,
      priceCents: plan.priceCents,
      currency: plan.currency,
    });

    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 86_400_000);
    const subscription = await this.prisma.base.subscription.upsert({
      where: { organizationId },
      update: {
        planId: plan.id,
        status: result.status,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        externalCustomerId: result.customerId,
        externalSubscriptionId: result.subscriptionId,
      },
      create: {
        organizationId,
        planId: plan.id,
        status: result.status,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        externalCustomerId: result.customerId,
        externalSubscriptionId: result.subscriptionId,
      },
      include: { plan: true },
    });

    await this.audit.record({
      organizationId,
      actorId: principal.userId,
      action: "subscription.created",
      targetType: "Subscription",
      targetId: subscription.id,
      metadata: { planCode: plan.code },
      ip: ctx.ip,
    });
    await this.webhooks
      .dispatch(organizationId, "subscription.created", { planCode: plan.code, status: subscription.status })
      .catch(() => undefined);
    if (result.status === "ACTIVE") {
      await this.webhooks
        .dispatch(organizationId, "payment.succeeded", {
          planCode: plan.code,
          amountCents: plan.priceCents,
          currency: plan.currency,
        })
        .catch(() => undefined);
    }

    return toSubscriptionDto(subscription);
  }

  async usage(): Promise<UsageSummaryResponse> {
    const periodKey = currentPeriodKey();
    const rollups = await this.prisma.tenant.usageRollup.findMany({ where: { periodKey } });
    if (rollups.length > 0) {
      const items: UsageSummaryItem[] = rollups.map((r) => ({
        metric: r.metric,
        periodKey,
        quantity: Number(r.quantity),
        rawCount: r.rawCount,
      }));
      return { periodKey, items };
    }

    // No rollup yet — compute the live aggregate from raw usage records.
    const records = await this.prisma.tenant.usageRecord.findMany({
      where: { periodKey },
      select: { metric: true, quantity: true },
    });
    const buckets = new Map<UsageMetric, { quantity: number; rawCount: number }>();
    for (const record of records) {
      const bucket = buckets.get(record.metric) ?? { quantity: 0, rawCount: 0 };
      bucket.quantity += Number(record.quantity);
      bucket.rawCount += 1;
      buckets.set(record.metric, bucket);
    }
    const items: UsageSummaryItem[] = [...buckets.entries()].map(([metric, b]) => ({
      metric,
      periodKey,
      quantity: b.quantity,
      rawCount: b.rawCount,
    }));
    return { periodKey, items };
  }

  async triggerRollup(organizationId: string): Promise<{ periodKey: string }> {
    const periodKey = currentPeriodKey();
    await this.rollupQueue.enqueue({ organizationId, periodKey });
    return { periodKey };
  }
}
