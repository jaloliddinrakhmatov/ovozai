import { Injectable } from "@nestjs/common";
import type { Membership, Organization, User } from "@ovozai/database";
import type {
  AuthSession,
  AuthTokens,
  LoginRequest,
  MeResponse,
  MembershipRole,
  MembershipSummary,
  OrganizationDto,
  RefreshRequest,
  RegisterRequest,
  SwitchOrgRequest,
} from "@ovozai/contracts";
import { AuditService } from "../audit/audit.service";
import { Problems } from "../common/problem.exception";
import { toOrganizationDto, toUserDto } from "../common/mappers";
import { isUniqueViolation } from "../common/prisma-errors";
import type { UserPrincipal } from "../common/principal.types";
import { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "../users/users.service";
import { PasswordService } from "./password.service";
import { TokenService, type IssuedSessionTokens } from "./token.service";

/** Per-request context used for auditing and session metadata. */
export interface RequestContext {
  userAgent?: string;
  ip?: string;
}

type MembershipWithOrg = Membership & { organization: Organization };

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  /** Register a new (orgless) user and start a session. */
  async register(dto: RegisterRequest, ctx: RequestContext): Promise<AuthSession> {
    const email = dto.email.toLowerCase();
    if (await this.users.findByEmail(email)) {
      throw Problems.conflict("An account with this email already exists.");
    }
    const hashedPassword = await this.passwords.hash(dto.password);

    let user: User;
    try {
      user = await this.users.createUser({ email, name: dto.name, hashedPassword });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw Problems.conflict("An account with this email already exists.");
      }
      throw error;
    }

    const issued = await this.tokens.createSession({
      userId: user.id,
      organizationId: null,
      role: null,
      userAgent: ctx.userAgent,
      ip: ctx.ip,
    });
    await this.audit.record({
      actorType: "USER",
      actorId: user.id,
      action: "auth.register",
      targetType: "User",
      targetId: user.id,
      ip: ctx.ip,
    });
    return this.buildSession(issued, user);
  }

  /** Authenticate by email + password and start a session on the first membership. */
  async login(dto: LoginRequest, ctx: RequestContext): Promise<AuthSession> {
    const user = await this.users.findByEmail(dto.email);
    const valid = user?.hashedPassword
      ? await this.passwords.verify(user.hashedPassword, dto.password)
      : false;

    if (!user || !valid || user.status !== "ACTIVE" || user.deletedAt) {
      await this.audit.record({
        actorType: "USER",
        actorId: user?.id ?? null,
        action: "auth.login_failed",
        targetType: "User",
        targetId: user?.id ?? null,
        metadata: { email: dto.email.toLowerCase() },
        ip: ctx.ip,
      });
      throw Problems.unauthorized("Invalid email or password.");
    }

    const memberships = await this.users.loadMemberships(user.id);
    const active = memberships[0];
    const issued = await this.tokens.createSession({
      userId: user.id,
      organizationId: active?.organizationId ?? null,
      role: active?.role ?? null,
      userAgent: ctx.userAgent,
      ip: ctx.ip,
    });
    await this.users.touchLastLogin(user.id);
    await this.audit.record({
      organizationId: active?.organizationId ?? null,
      actorType: "USER",
      actorId: user.id,
      action: "auth.login",
      targetType: "User",
      targetId: user.id,
      ip: ctx.ip,
    });
    return this.buildSession(issued, user, memberships);
  }

  /** Rotate the refresh token and issue a new access token. */
  async refresh(dto: RefreshRequest, ctx: RequestContext): Promise<AuthTokens> {
    const issued = await this.tokens.rotateSession(dto.refreshToken, ctx);
    await this.audit.record({
      organizationId: issued.organizationId,
      actorType: "USER",
      actorId: issued.userId,
      action: "auth.refresh",
      targetType: "Session",
      targetId: issued.sessionId,
      ip: ctx.ip,
    });
    return {
      tokenType: "Bearer",
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      expiresIn: issued.expiresIn,
    };
  }

  /** Revoke the current session. */
  async logout(principal: UserPrincipal, ctx: RequestContext): Promise<void> {
    await this.tokens.revokeSession(principal.sessionId);
    await this.audit.record({
      organizationId: principal.organizationId,
      actorType: "USER",
      actorId: principal.userId,
      action: "auth.logout",
      targetType: "Session",
      targetId: principal.sessionId,
      ip: ctx.ip,
    });
  }

  /** Re-issue tokens with a different active organization the user belongs to. */
  async switchOrg(
    principal: UserPrincipal,
    dto: SwitchOrgRequest,
    ctx: RequestContext,
  ): Promise<AuthSession> {
    const membership = await this.prisma.base.membership.findUnique({
      where: { organizationId_userId: { organizationId: dto.organizationId, userId: principal.userId } },
      include: { organization: true },
    });
    if (!membership || membership.organization.deletedAt) {
      throw Problems.forbidden("You are not a member of that organization.");
    }

    const issued = await this.tokens.issueForSession(
      principal.sessionId,
      principal.userId,
      membership.organizationId,
      membership.role,
      ctx,
    );
    await this.audit.record({
      organizationId: membership.organizationId,
      actorType: "USER",
      actorId: principal.userId,
      action: "auth.switch_org",
      targetType: "Organization",
      targetId: membership.organizationId,
      ip: ctx.ip,
    });

    const user = await this.users.findById(principal.userId);
    if (!user) {
      throw Problems.unauthorized();
    }
    return this.buildSession(issued, user);
  }

  /** Current user, memberships, and active organization. */
  async me(principal: UserPrincipal): Promise<MeResponse> {
    const user = await this.users.findById(principal.userId);
    if (!user) {
      throw Problems.unauthorized();
    }
    const memberships = await this.users.loadMemberships(user.id);
    return {
      user: toUserDto(user),
      activeOrganization: this.activeOrg(principal.organizationId, memberships),
      memberships: this.summaries(memberships),
    };
  }

  /**
   * Re-issue the current session's tokens for a (new) active organization/role —
   * used after creating an organization or accepting an invitation. Returns the
   * full authenticated session so the client can swap in the new token pair.
   */
  async reissueSession(
    principal: UserPrincipal,
    organizationId: string | null,
    role: MembershipRole | null,
    ctx: RequestContext,
  ): Promise<AuthSession> {
    const issued = await this.tokens.issueForSession(
      principal.sessionId,
      principal.userId,
      organizationId,
      role,
      ctx,
    );
    const user = await this.users.findById(principal.userId);
    if (!user) {
      throw Problems.unauthorized();
    }
    return this.buildSession(issued, user);
  }

  private async buildSession(
    issued: IssuedSessionTokens,
    user: User,
    loaded?: MembershipWithOrg[],
  ): Promise<AuthSession> {
    const memberships = loaded ?? (await this.users.loadMemberships(user.id));
    return {
      tokens: {
        tokenType: "Bearer",
        accessToken: issued.accessToken,
        refreshToken: issued.refreshToken,
        expiresIn: issued.expiresIn,
      },
      user: toUserDto(user),
      activeOrganization: this.activeOrg(issued.organizationId, memberships),
      memberships: this.summaries(memberships),
    };
  }

  private activeOrg(
    organizationId: string | null,
    memberships: MembershipWithOrg[],
  ): OrganizationDto | null {
    if (!organizationId) return null;
    const match = memberships.find((m) => m.organizationId === organizationId);
    return match ? toOrganizationDto(match.organization) : null;
  }

  private summaries(memberships: MembershipWithOrg[]): MembershipSummary[] {
    return memberships.map((m) => ({ organization: toOrganizationDto(m.organization), role: m.role }));
  }
}
