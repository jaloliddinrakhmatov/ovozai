import { Injectable } from "@nestjs/common";
import type { ApiKeyDto, ApiKeyCreatedDto, CreateApiKeyRequest, PaginationQuery } from "@ovozai/contracts";
import { AuditService } from "../audit/audit.service";
import { Problems } from "../common/problem.exception";
import { toApiKeyDto } from "../common/mappers";
import type { UserPrincipal } from "../common/principal.types";
import { PrismaService } from "../prisma/prisma.service";
import type { RequestContext } from "../auth/auth.service";
import { constantTimeEqualHex, generateApiKey, parseApiKey, sha256Hex } from "../auth/crypto.util";

interface ApiKeyPage {
  data: ApiKeyDto[];
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
}

/** Result of authenticating a raw API key (for future server-to-server auth). */
export interface VerifiedApiKey {
  apiKeyId: string;
  organizationId: string;
  scopes: string[];
}

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** List the active organization's keys (metadata only; never the secret). */
  async list(query: PaginationQuery): Promise<ApiKeyPage> {
    const take = query.limit;
    const rows = await this.prisma.tenant.apiKey.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > take;
    const page = hasNextPage ? rows.slice(0, take) : rows;
    return {
      data: page.map((key) => this.withEffectiveStatus(toApiKeyDto(key))),
      pageInfo: {
        nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null,
        hasNextPage,
      },
    };
  }

  /** Create a key; the full secret is returned exactly once. */
  async create(
    principal: UserPrincipal,
    organizationId: string,
    dto: CreateApiKeyRequest,
    ctx: RequestContext,
  ): Promise<ApiKeyCreatedDto> {
    const generated = generateApiKey();
    const created = await this.prisma.tenant.apiKey.create({
      data: {
        organizationId,
        name: dto.name,
        prefix: generated.prefix,
        hashedKey: generated.hashedKey,
        scopes: dto.scopes ?? [],
        status: "ACTIVE",
        createdById: principal.userId,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
    await this.audit.record({
      organizationId,
      actorType: "USER",
      actorId: principal.userId,
      action: "apikey.create",
      targetType: "ApiKey",
      targetId: created.id,
      metadata: { name: dto.name, prefix: generated.prefix },
      ip: ctx.ip,
    });
    return { ...toApiKeyDto(created), key: generated.key };
  }

  /** Revoke a key (stays visible in listings as REVOKED). */
  async revoke(
    principal: UserPrincipal,
    organizationId: string,
    id: string,
    ctx: RequestContext,
  ): Promise<void> {
    const result = await this.prisma.tenant.apiKey.updateMany({
      where: { id, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    if (result.count === 0) {
      throw Problems.notFound("API key not found.");
    }
    await this.audit.record({
      organizationId,
      actorType: "USER",
      actorId: principal.userId,
      action: "apikey.revoke",
      targetType: "ApiKey",
      targetId: id,
      ip: ctx.ip,
    });
  }

  /**
   * Authenticate a raw API key. Returns the owning org + scopes, or null. Uses
   * the unscoped client (no tenant context exists during authentication). Not yet
   * wired into request auth — the first server-to-server endpoint (a later phase)
   * will consume it — but implemented and tested so the mechanism is real.
   */
  async verify(raw: string): Promise<VerifiedApiKey | null> {
    const parsed = parseApiKey(raw);
    if (!parsed) return null;

    const key = await this.prisma.base.apiKey.findUnique({ where: { prefix: parsed.prefix } });
    if (!key || key.status !== "ACTIVE" || key.deletedAt) return null;
    if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) return null;
    if (!constantTimeEqualHex(sha256Hex(parsed.secret), key.hashedKey)) return null;

    await this.prisma.base.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    });
    return { apiKeyId: key.id, organizationId: key.organizationId, scopes: key.scopes };
  }

  private withEffectiveStatus(dto: ApiKeyDto): ApiKeyDto {
    if (dto.status === "ACTIVE" && dto.expiresAt && new Date(dto.expiresAt).getTime() <= Date.now()) {
      return { ...dto, status: "EXPIRED" };
    }
    return dto;
  }
}
