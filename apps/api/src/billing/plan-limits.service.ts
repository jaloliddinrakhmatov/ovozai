import { Injectable } from "@nestjs/common";
import { Problems } from "../common/problem.exception";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Enforces plan limits (gates feature access by the org's subscription plan).
 * Uses the base client with an explicit org so it is callable from request
 * handlers regardless of tenant context.
 */
@Injectable()
export class PlanLimitsService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanCreateAgent(organizationId: string): Promise<void> {
    const max = await this.maxAgents(organizationId);
    if (max === null) return;
    const count = await this.prisma.base.agent.count({
      where: { organizationId, deletedAt: null },
    });
    if (count >= max) {
      throw Problems.forbidden(
        `Plan limit reached: your plan allows ${max} agent(s). Upgrade your plan to add more.`,
      );
    }
  }

  private async maxAgents(organizationId: string): Promise<number | null> {
    const subscription = await this.prisma.base.subscription.findFirst({
      where: { organizationId },
      include: { plan: true },
    });
    const planLimits = (subscription?.plan.limits ?? null) as { maxAgents?: unknown } | null;
    if (planLimits && typeof planLimits.maxAgents === "number") {
      return planLimits.maxAgents;
    }
    // No subscription → fall back to the free plan's limit.
    const free = await this.prisma.base.plan.findFirst({ where: { code: "free" } });
    const freeLimits = (free?.limits ?? null) as { maxAgents?: unknown } | null;
    return freeLimits && typeof freeLimits.maxAgents === "number" ? freeLimits.maxAgents : null;
  }
}
