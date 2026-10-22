import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  AuthSession,
  CreateInvitationRequest,
  InvitationCreatedDto,
  InvitationDto,
  MembershipDto,
  MembershipWithUserDto,
  PaginationQuery,
  UpdateMembershipRoleRequest,
} from "@ovozai/contracts";
import { AuditService } from "../audit/audit.service";
import { Problems } from "../common/problem.exception";
import { toInvitationDto, toMembershipDto, toMembershipWithUserDto } from "../common/mappers";
import type { UserPrincipal } from "../common/principal.types";
import { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "../users/users.service";
import { AuthService, type RequestContext } from "../auth/auth.service";
import { randomToken, sha256Hex } from "../auth/crypto.util";

interface MemberPage {
  data: MembershipWithUserDto[];
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
}

interface InvitationPage {
  data: InvitationDto[];
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
}

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  /** List members of the active organization (cursor-paginated by id). */
  async list(organizationId: string, query: PaginationQuery): Promise<MemberPage> {
    const take = query.limit;
    const rows = await this.prisma.base.membership.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > take;
    const page = hasNextPage ? rows.slice(0, take) : rows;
    return {
      data: page.map(toMembershipWithUserDto),
      pageInfo: {
        nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null,
        hasNextPage,
      },
    };
  }

  /** List the organization's pending (not-yet-accepted) invitations. */
  async listInvitations(query: PaginationQuery): Promise<InvitationPage> {
    const take = query.limit;
    const rows = await this.prisma.tenant.invitation.findMany({
      where: { status: "PENDING" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > take;
    const page = hasNextPage ? rows.slice(0, take) : rows;
    return {
      data: page.map(toInvitationDto),
      pageInfo: {
        nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null,
        hasNextPage,
      },
    };
  }

  /** Revoke a pending invitation so its token can no longer be accepted. */
  async revokeInvitation(
    principal: UserPrincipal,
    organizationId: string,
    id: string,
    ctx: RequestContext,
  ): Promise<void> {
    const result = await this.prisma.tenant.invitation.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    if (result.count === 0) {
      throw Problems.notFound("Invitation not found or already handled.");
    }
    await this.audit.record({
      organizationId,
      actorId: principal.userId,
      action: "membership.invite.revoke",
      targetType: "Invitation",
      targetId: id,
      ip: ctx.ip,
    });
  }

  /** Invite a user by email with a role. Returns the one-time acceptance token. */
  async invite(
    principal: UserPrincipal,
    organizationId: string,
    dto: CreateInvitationRequest,
    ctx: RequestContext,
  ): Promise<InvitationCreatedDto> {
    const email = dto.email.toLowerCase();

    const existingUser = await this.users.findByEmail(email);
    if (existingUser) {
      const membership = await this.prisma.base.membership.findUnique({
        where: { organizationId_userId: { organizationId, userId: existingUser.id } },
      });
      if (membership) {
        throw Problems.conflict("That user is already a member of this organization.");
      }
    }

    // Supersede any outstanding pending invite for this email (tenant-scoped).
    await this.prisma.tenant.invitation.updateMany({
      where: { email, status: "PENDING" },
      data: { status: "REVOKED", revokedAt: new Date() },
    });

    const token = randomToken(32);
    const ttlSeconds = Number(this.config.get("INVITATION_TTL_SECONDS") ?? 604_800);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const invitation = await this.prisma.tenant.invitation.create({
      data: {
        organizationId,
        email,
        role: dto.role,
        tokenHash: sha256Hex(token),
        status: "PENDING",
        invitedById: principal.userId,
        expiresAt,
      },
    });

    await this.audit.record({
      organizationId,
      actorType: "USER",
      actorId: principal.userId,
      action: "membership.invite",
      targetType: "Invitation",
      targetId: invitation.id,
      metadata: { email, role: dto.role },
      ip: ctx.ip,
    });

    const webUrl = this.config.get<string>("APP_WEB_URL") ?? "http://localhost:3000";
    return {
      ...toInvitationDto(invitation),
      token,
      acceptPath: `${webUrl}/dashboard/accept-invite?token=${token}`,
    };
  }

  /** Accept an invitation by its raw token; the caller joins the org and the */
  /** session is re-issued for it. Looks up the invite via the unscoped client. */
  async accept(principal: UserPrincipal, token: string, ctx: RequestContext): Promise<AuthSession> {
    const invitation = await this.prisma.base.invitation.findUnique({
      where: { tokenHash: sha256Hex(token) },
      include: { organization: true },
    });
    if (!invitation || invitation.status !== "PENDING") {
      throw Problems.notFound("Invitation is invalid or has already been used.");
    }
    if (invitation.organization.deletedAt) {
      throw Problems.notFound("Invitation is invalid or has already been used.");
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      await this.prisma.base.invitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });
      throw Problems.conflict("This invitation has expired.");
    }

    const user = await this.users.findById(principal.userId);
    if (!user) {
      throw Problems.unauthorized();
    }
    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw Problems.forbidden("This invitation was sent to a different email address.");
    }

    const joined = await this.prisma.base.$transaction(async (tx) => {
      const current = await tx.invitation.findUnique({ where: { id: invitation.id } });
      if (!current || current.status !== "PENDING") {
        throw Problems.conflict("This invitation has already been used.");
      }
      const existing = await tx.membership.findUnique({
        where: {
          organizationId_userId: { organizationId: invitation.organizationId, userId: user.id },
        },
      });
      const role = existing?.role ?? invitation.role;
      if (!existing) {
        await tx.membership.create({
          data: {
            organizationId: invitation.organizationId,
            userId: user.id,
            role: invitation.role,
            invitedAt: invitation.createdAt,
            acceptedAt: new Date(),
          },
        });
      }
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedById: user.id },
      });
      return { organizationId: invitation.organizationId, role };
    });

    await this.audit.record({
      organizationId: joined.organizationId,
      actorType: "USER",
      actorId: user.id,
      action: "membership.invite_accepted",
      targetType: "Invitation",
      targetId: invitation.id,
      ip: ctx.ip,
    });

    return this.auth.reissueSession(principal, joined.organizationId, joined.role, ctx);
  }

  /** Change a member's role, enforcing OWNER-only transitions and last-owner safety. */
  async updateRole(
    principal: UserPrincipal,
    organizationId: string,
    membershipId: string,
    dto: UpdateMembershipRoleRequest,
    ctx: RequestContext,
  ): Promise<MembershipDto> {
    const membership = await this.prisma.base.membership.findFirst({
      where: { id: membershipId, organizationId },
    });
    if (!membership) {
      throw Problems.notFound("Membership not found.");
    }

    const touchesOwner = membership.role === "OWNER" || dto.role === "OWNER";
    if (touchesOwner && principal.role !== "OWNER") {
      throw Problems.forbidden("Only an OWNER can grant or change the OWNER role.");
    }
    if (membership.role === "OWNER" && dto.role !== "OWNER" && (await this.ownerCount(organizationId)) <= 1) {
      throw Problems.conflict("Cannot remove the last OWNER of the organization.");
    }

    const updated = await this.prisma.base.membership.update({
      where: { id: membership.id },
      data: { role: dto.role },
    });
    await this.audit.record({
      organizationId,
      actorType: "USER",
      actorId: principal.userId,
      action: "membership.role_change",
      targetType: "Membership",
      targetId: membership.id,
      metadata: { from: membership.role, to: dto.role, userId: membership.userId },
      ip: ctx.ip,
    });
    return toMembershipDto(updated);
  }

  /** Remove a member, enforcing OWNER-only removal of owners and last-owner safety. */
  async remove(
    principal: UserPrincipal,
    organizationId: string,
    membershipId: string,
    ctx: RequestContext,
  ): Promise<void> {
    const membership = await this.prisma.base.membership.findFirst({
      where: { id: membershipId, organizationId },
    });
    if (!membership) {
      throw Problems.notFound("Membership not found.");
    }
    if (membership.role === "OWNER") {
      if (principal.role !== "OWNER") {
        throw Problems.forbidden("Only an OWNER can remove an OWNER.");
      }
      if ((await this.ownerCount(organizationId)) <= 1) {
        throw Problems.conflict("Cannot remove the last OWNER of the organization.");
      }
    }

    await this.prisma.base.membership.delete({ where: { id: membership.id } });
    await this.audit.record({
      organizationId,
      actorType: "USER",
      actorId: principal.userId,
      action: "membership.remove",
      targetType: "Membership",
      targetId: membership.id,
      metadata: { userId: membership.userId, role: membership.role },
      ip: ctx.ip,
    });
  }

  private ownerCount(organizationId: string): Promise<number> {
    return this.prisma.base.membership.count({ where: { organizationId, role: "OWNER" } });
  }
}
