import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { HEADERS, type MembershipRole } from "@ovozai/contracts";
import { IS_PUBLIC_KEY } from "../common/public.decorator";
import { Problems } from "../common/problem.exception";
import type { RequestWithContext, UserPrincipal } from "../common/principal.types";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { TokenService } from "./token.service";

/**
 * Global authentication guard. Skips `@Public()` routes; otherwise it verifies
 * the bearer access token, checks the session denylist, confirms the user is
 * active, and resolves the active organization + role from the **live**
 * `Membership` (not blindly from the token), so revoked members / role changes
 * take effect immediately. An `X-Organization-Id` header, if present, must match
 * the resolved active org (docs/API.md §2.4).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const authHeaderRaw = request.headers.authorization;
    const authHeader = Array.isArray(authHeaderRaw) ? authHeaderRaw[0] : authHeaderRaw;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw Problems.unauthorized("A bearer access token is required.");
    }

    const claims = await this.tokens.verifyAccessToken(authHeader.slice(7).trim());
    if (!claims) {
      throw Problems.invalidToken("Access token is missing, malformed, or expired.");
    }

    if (await this.redis.isSessionDenied(claims.sid)) {
      throw Problems.invalidToken("Session has been revoked.");
    }

    const user = await this.prisma.base.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, status: true, deletedAt: true },
    });
    if (!user || user.status !== "ACTIVE" || user.deletedAt) {
      throw Problems.unauthorized("User account is not active.");
    }

    let organizationId: string | null = null;
    let role: MembershipRole | null = null;
    if (claims.org) {
      const membership = await this.prisma.base.membership.findUnique({
        where: { organizationId_userId: { organizationId: claims.org, userId: claims.sub } },
        select: { role: true },
      });
      if (membership) {
        organizationId = claims.org;
        role = membership.role;
      }
    }

    const orgHeaderRaw = request.headers[HEADERS.organizationId];
    const orgHeader = Array.isArray(orgHeaderRaw) ? orgHeaderRaw[0] : orgHeaderRaw;
    if (orgHeader && orgHeader !== organizationId) {
      throw Problems.forbiddenOrgMismatch(
        "X-Organization-Id does not match the active organization for this session.",
      );
    }

    const principal: UserPrincipal = {
      type: "user",
      userId: user.id,
      sessionId: claims.sid,
      organizationId,
      role,
    };
    request.principal = principal;
    return true;
  }
}
