import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { MembershipRole } from "@ovozai/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { Problems } from "../common/problem.exception";
import {
  buildRefreshToken,
  constantTimeEqualHex,
  parseRefreshToken,
  sha256Hex,
} from "./crypto.util";

/** Claims carried by the short-lived access JWT. */
export interface AccessTokenClaims {
  /** User id. */
  sub: string;
  /** Session id (ties the access token to a revocable session). */
  sid: string;
  /** Active organization id, or null for an orgless user. */
  org: string | null;
  /** Role in the active organization, or null. */
  role: MembershipRole | null;
}

/** A freshly issued access + refresh token pair for a session. */
export interface IssuedSessionTokens {
  sessionId: string;
  userId: string;
  organizationId: string | null;
  role: MembershipRole | null;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Issues and rotates authentication tokens, and owns the session lifecycle
 * (docs/SECURITY.md §2):
 *   - access tokens are short-lived HS256 JWTs;
 *   - refresh tokens are opaque `<sessionId>.<secret>` strings whose secret hash
 *     is the single source of truth on the `Session` row;
 *   - refresh rotates the secret; presenting an already-rotated token for an
 *     ACTIVE session is reuse/theft and revokes the whole session.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  get accessTtlSeconds(): number {
    return Number(this.config.get("ACCESS_TOKEN_TTL_SECONDS") ?? 900);
  }

  private get refreshTtlSeconds(): number {
    return Number(this.config.get("REFRESH_TOKEN_TTL_SECONDS") ?? 2_592_000);
  }

  signAccessToken(claims: AccessTokenClaims): Promise<string> {
    return this.jwt.signAsync(
      { sub: claims.sub, sid: claims.sid, org: claims.org, role: claims.role },
      { expiresIn: this.accessTtlSeconds },
    );
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        sid: string;
        org: string | null;
        role: MembershipRole | null;
      }>(token);
      return {
        sub: payload.sub,
        sid: payload.sid,
        org: payload.org ?? null,
        role: payload.role ?? null,
      };
    } catch {
      return null;
    }
  }

  /** Create a brand-new session (login/register) and issue its first token pair. */
  async createSession(params: {
    userId: string;
    organizationId: string | null;
    role: MembershipRole | null;
    userAgent?: string;
    ip?: string;
  }): Promise<IssuedSessionTokens> {
    const sessionId = randomUUID();
    const refresh = buildRefreshToken(sessionId);
    const expiresAt = new Date(Date.now() + this.refreshTtlSeconds * 1000);

    await this.prisma.base.session.create({
      data: {
        id: sessionId,
        userId: params.userId,
        organizationId: params.organizationId,
        tokenHash: refresh.tokenHash,
        status: "ACTIVE",
        expiresAt,
        userAgent: params.userAgent,
        ip: params.ip,
      },
    });

    const accessToken = await this.signAccessToken({
      sub: params.userId,
      sid: sessionId,
      org: params.organizationId,
      role: params.role,
    });

    return {
      sessionId,
      userId: params.userId,
      organizationId: params.organizationId,
      role: params.role,
      accessToken,
      refreshToken: refresh.token,
      expiresIn: this.accessTtlSeconds,
    };
  }

  /**
   * Rotate a refresh token. Validates the session, detects reuse (revoking the
   * session), re-resolves the active org/role, and issues a fresh token pair.
   */
  async rotateSession(
    rawRefreshToken: string,
    context: { userAgent?: string; ip?: string } = {},
  ): Promise<IssuedSessionTokens> {
    const parsed = parseRefreshToken(rawRefreshToken);
    if (!parsed) {
      throw Problems.invalidToken("Malformed refresh token.");
    }

    const session = await this.prisma.base.session.findUnique({ where: { id: parsed.sessionId } });
    if (!session) {
      throw Problems.invalidToken("Refresh token is not recognized.");
    }
    if (session.status !== "ACTIVE" || session.expiresAt.getTime() <= Date.now()) {
      throw Problems.invalidToken("Session is no longer active.");
    }

    const presentedHash = sha256Hex(parsed.secret);
    if (!constantTimeEqualHex(presentedHash, session.tokenHash)) {
      // Reuse of a rotated token on an active session: treat as theft.
      await this.revokeSession(session.id);
      this.logger.warn(`Refresh-token reuse detected for session ${session.id}; session revoked.`);
      throw Problems.invalidToken("Refresh token reuse detected; session revoked.");
    }

    // Re-resolve org/role from live membership so changes take effect on refresh.
    const organizationId = session.organizationId;
    const role = organizationId ? await this.resolveRole(session.userId, organizationId) : null;
    const effectiveOrg = organizationId && role ? organizationId : null;

    return this.issueForSession(session.id, session.userId, effectiveOrg, role, context);
  }

  /**
   * Re-issue tokens for an existing session with a (possibly new) active org and
   * role — used by switch-org, organization creation, and invite acceptance.
   * Rotates the refresh token so the client always receives a fresh pair.
   */
  async issueForSession(
    sessionId: string,
    userId: string,
    organizationId: string | null,
    role: MembershipRole | null,
    context: { userAgent?: string; ip?: string } = {},
  ): Promise<IssuedSessionTokens> {
    const refresh = buildRefreshToken(sessionId);
    await this.prisma.base.session.update({
      where: { id: sessionId },
      data: {
        organizationId,
        tokenHash: refresh.tokenHash,
        lastUsedAt: new Date(),
        userAgent: context.userAgent,
        ip: context.ip,
      },
    });

    const accessToken = await this.signAccessToken({
      sub: userId,
      sid: sessionId,
      org: organizationId,
      role,
    });

    return {
      sessionId,
      userId,
      organizationId,
      role,
      accessToken,
      refreshToken: refresh.token,
      expiresIn: this.accessTtlSeconds,
    };
  }

  /** Revoke a session and denylist its access tokens for their remaining TTL. */
  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.base.session.updateMany({
      where: { id: sessionId, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    await this.redis.denySession(sessionId, this.accessTtlSeconds);
  }

  private async resolveRole(userId: string, organizationId: string): Promise<MembershipRole | null> {
    const membership = await this.prisma.base.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { role: true },
    });
    return membership?.role ?? null;
  }
}
