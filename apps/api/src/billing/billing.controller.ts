import { Body, Controller, Get, HttpCode, Post, Req } from "@nestjs/common";
import {
  createSubscriptionRequestSchema,
  type CreateSubscriptionRequest,
  type PlanDto,
  type SubscriptionDto,
  type UsageSummaryResponse,
} from "@ovozai/contracts";
import { CurrentPrincipal } from "../common/current-principal.decorator";
import { Roles } from "../common/roles.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { requestContextFrom } from "../common/request-context";
import type { RequestWithContext, UserPrincipal } from "../common/principal.types";
import { BillingService } from "./billing.service";

@Controller("billing")
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get("plans")
  @Roles("VIEWER")
  listPlans(): Promise<PlanDto[]> {
    return this.billing.listPlans();
  }

  @Get("subscription")
  @Roles("ADMIN")
  getSubscription(): Promise<SubscriptionDto | null> {
    return this.billing.getSubscription();
  }

  @Post("subscription")
  @Roles("OWNER")
  subscribe(
    @CurrentPrincipal() principal: UserPrincipal,
    @Body(new ZodValidationPipe(createSubscriptionRequestSchema)) body: CreateSubscriptionRequest,
    @Req() req: RequestWithContext,
  ): Promise<SubscriptionDto> {
    return this.billing.subscribe(principal, principal.organizationId as string, body, requestContextFrom(req));
  }

  @Get("usage")
  @Roles("ADMIN")
  usage(): Promise<UsageSummaryResponse> {
    return this.billing.usage();
  }

  @Post("usage/rollup")
  @Roles("ADMIN")
  @HttpCode(202)
  rollup(@CurrentPrincipal() principal: UserPrincipal): Promise<{ periodKey: string }> {
    return this.billing.triggerRollup(principal.organizationId as string);
  }
}
