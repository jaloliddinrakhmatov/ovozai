import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Req } from "@nestjs/common";
import {
  createOrganizationRequestSchema,
  updateOrganizationRequestSchema,
  type AuthSession,
  type CreateOrganizationRequest,
  type OrganizationDto,
  type UpdateOrganizationRequest,
} from "@ovozai/contracts";
import { CurrentPrincipal } from "../common/current-principal.decorator";
import { Roles } from "../common/roles.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { RequestWithContext, UserPrincipal } from "../common/principal.types";
import { OrganizationsService } from "./organizations.service";

function contextFrom(req: RequestWithContext) {
  const userAgent = req.headers["user-agent"];
  return { userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent, ip: req.ip };
}

@Controller("organizations")
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  /** Any authenticated user may create an organization (they become its OWNER). */
  @Post()
  create(
    @CurrentPrincipal() principal: UserPrincipal,
    @Body(new ZodValidationPipe(createOrganizationRequestSchema)) body: CreateOrganizationRequest,
    @Req() req: RequestWithContext,
  ): Promise<AuthSession> {
    return this.organizations.create(principal, body, contextFrom(req));
  }

  @Get("current")
  @Roles("VIEWER")
  getCurrent(@CurrentPrincipal() principal: UserPrincipal): Promise<OrganizationDto> {
    return this.organizations.getCurrent(principal.organizationId as string);
  }

  @Patch("current")
  @Roles("ADMIN")
  updateCurrent(
    @CurrentPrincipal() principal: UserPrincipal,
    @Body(new ZodValidationPipe(updateOrganizationRequestSchema)) body: UpdateOrganizationRequest,
    @Req() req: RequestWithContext,
  ): Promise<OrganizationDto> {
    return this.organizations.updateCurrent(
      principal,
      principal.organizationId as string,
      body,
      contextFrom(req),
    );
  }

  @Delete("current")
  @Roles("OWNER")
  @HttpCode(204)
  deleteCurrent(
    @CurrentPrincipal() principal: UserPrincipal,
    @Req() req: RequestWithContext,
  ): Promise<void> {
    return this.organizations.deleteCurrent(
      principal,
      principal.organizationId as string,
      contextFrom(req),
    );
  }
}
