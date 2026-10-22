import { Body, Controller, Get, HttpCode, Post, Put, Req } from "@nestjs/common";
import {
  erasureRequestSchema,
  updateRetentionPolicyRequestSchema,
  type ErasureRequest,
  type ErasureResult,
  type RetentionPolicy,
  type RlsStatus,
  type UpdateRetentionPolicyRequest,
} from "@ovozai/contracts";
import { CurrentPrincipal } from "../common/current-principal.decorator";
import { Roles } from "../common/roles.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { requestContextFrom } from "../common/request-context";
import type { RequestWithContext, UserPrincipal } from "../common/principal.types";
import { ComplianceService } from "./compliance.service";

/** Data-protection & compliance surface (Phase 7). Mounted at /api/v1/compliance. */
@Controller("compliance")
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Get("retention")
  @Roles("ADMIN")
  getRetention(@CurrentPrincipal() principal: UserPrincipal): Promise<RetentionPolicy> {
    return this.compliance.getRetentionPolicy(principal.organizationId as string);
  }

  @Get("rls-status")
  @Roles("ADMIN")
  rlsStatus(@CurrentPrincipal() principal: UserPrincipal): Promise<RlsStatus> {
    return this.compliance.rlsStatus(principal.organizationId as string);
  }

  @Put("retention")
  @Roles("OWNER")
  setRetention(
    @CurrentPrincipal() principal: UserPrincipal,
    @Body(new ZodValidationPipe(updateRetentionPolicyRequestSchema)) body: UpdateRetentionPolicyRequest,
    @Req() req: RequestWithContext,
  ): Promise<RetentionPolicy> {
    return this.compliance.setRetentionPolicy(
      principal,
      principal.organizationId as string,
      body,
      requestContextFrom(req),
    );
  }

  @Post("erasure")
  @Roles("OWNER")
  erase(
    @CurrentPrincipal() principal: UserPrincipal,
    @Body(new ZodValidationPipe(erasureRequestSchema)) body: ErasureRequest,
    @Req() req: RequestWithContext,
  ): Promise<ErasureResult> {
    return this.compliance.eraseCustomer(principal, body, requestContextFrom(req));
  }

  @Post("retention/sweep")
  @Roles("OWNER")
  @HttpCode(202)
  sweep(@CurrentPrincipal() principal: UserPrincipal): Promise<{ queued: true }> {
    return this.compliance.triggerSweep(principal.organizationId as string);
  }
}
