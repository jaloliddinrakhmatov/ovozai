import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import {
  createInvitationRequestSchema,
  paginationQuerySchema,
  updateMembershipRoleRequestSchema,
  type AuthSession,
  type CreateInvitationRequest,
  type InvitationCreatedDto,
  type MembershipDto,
  type PaginationQuery,
  type UpdateMembershipRoleRequest,
} from "@ovozai/contracts";
import { CurrentPrincipal } from "../common/current-principal.decorator";
import { Roles } from "../common/roles.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { RequestWithContext, UserPrincipal } from "../common/principal.types";
import { MembershipsService } from "./memberships.service";

function contextFrom(req: RequestWithContext) {
  const userAgent = req.headers["user-agent"];
  return { userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent, ip: req.ip };
}

@Controller("memberships")
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get()
  @Roles("MEMBER")
  list(
    @CurrentPrincipal() principal: UserPrincipal,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ) {
    return this.memberships.list(principal.organizationId as string, query);
  }

  @Post("invites")
  @Roles("ADMIN")
  invite(
    @CurrentPrincipal() principal: UserPrincipal,
    @Body(new ZodValidationPipe(createInvitationRequestSchema)) body: CreateInvitationRequest,
    @Req() req: RequestWithContext,
  ): Promise<InvitationCreatedDto> {
    return this.memberships.invite(
      principal,
      principal.organizationId as string,
      body,
      contextFrom(req),
    );
  }

  /** Accept an invitation. Authenticated, but the invitee may be orgless. */
  @Post("invites/:token/accept")
  acceptInvite(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("token") token: string,
    @Req() req: RequestWithContext,
  ): Promise<AuthSession> {
    return this.memberships.accept(principal, token, contextFrom(req));
  }

  @Patch(":id")
  @Roles("ADMIN")
  updateRole(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateMembershipRoleRequestSchema)) body: UpdateMembershipRoleRequest,
    @Req() req: RequestWithContext,
  ): Promise<MembershipDto> {
    return this.memberships.updateRole(
      principal,
      principal.organizationId as string,
      id,
      body,
      contextFrom(req),
    );
  }

  @Delete(":id")
  @Roles("ADMIN")
  @HttpCode(204)
  remove(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithContext,
  ): Promise<void> {
    return this.memberships.remove(
      principal,
      principal.organizationId as string,
      id,
      contextFrom(req),
    );
  }
}
