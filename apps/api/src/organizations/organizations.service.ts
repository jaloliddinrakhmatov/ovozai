import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { Organization } from "@ovozai/database";
import type {
  AuthSession,
  CreateOrganizationRequest,
  OrganizationDto,
  UpdateOrganizationRequest,
} from "@ovozai/contracts";
import { AuditService } from "../audit/audit.service";
import { Problems } from "../common/problem.exception";
import { toOrganizationDto } from "../common/mappers";
import { isUniqueViolation } from "../common/prisma-errors";
import type { UserPrincipal } from "../common/principal.types";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService, type RequestContext } from "../auth/auth.service";

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
  if (base.length >= 2) return base;
  return `org-${randomBytes(3).toString("hex")}`;
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  /** Create an organization, make the caller its OWNER, and re-issue the session. */
  async create(
    principal: UserPrincipal,
    dto: CreateOrganizationRequest,
    ctx: RequestContext,
  ): Promise<AuthSession> {
    const baseSlug = dto.slug ?? slugify(dto.name);

    let organization: Organization | undefined;
    for (let attempt = 0; attempt < 6 && !organization; attempt += 1) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomBytes(3).toString("hex")}`;
      try {
        organization = await this.prisma.base.$transaction(async (tx) => {
          const org = await tx.organization.create({ data: { name: dto.name, slug } });
          await tx.membership.create({
            data: {
              organizationId: org.id,
              userId: principal.userId,
              role: "OWNER",
              acceptedAt: new Date(),
            },
          });
          return org;
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          continue; // slug collision — retry with a suffix
        }
        throw error;
      }
    }

    if (!organization) {
      throw Problems.conflict("Could not allocate a unique slug for the organization.");
    }

    await this.audit.record({
      organizationId: organization.id,
      actorType: "USER",
      actorId: principal.userId,
      action: "organization.create",
      targetType: "Organization",
      targetId: organization.id,
      ip: ctx.ip,
    });

    return this.auth.reissueSession(principal, organization.id, "OWNER", ctx);
  }

  async getCurrent(organizationId: string): Promise<OrganizationDto> {
    const org = await this.loadActive(organizationId);
    return toOrganizationDto(org);
  }

  async updateCurrent(
    principal: UserPrincipal,
    organizationId: string,
    dto: UpdateOrganizationRequest,
    ctx: RequestContext,
  ): Promise<OrganizationDto> {
    await this.loadActive(organizationId);
    const updated = await this.prisma.base.organization.update({
      where: { id: organizationId },
      data: { name: dto.name ?? undefined, locale: dto.locale ?? undefined },
    });
    await this.audit.record({
      organizationId,
      actorType: "USER",
      actorId: principal.userId,
      action: "organization.update",
      targetType: "Organization",
      targetId: organizationId,
      metadata: { ...dto },
      ip: ctx.ip,
    });
    return toOrganizationDto(updated);
  }

  async deleteCurrent(
    principal: UserPrincipal,
    organizationId: string,
    ctx: RequestContext,
  ): Promise<void> {
    await this.loadActive(organizationId);
    await this.prisma.base.organization.update({
      where: { id: organizationId },
      data: { deletedAt: new Date(), status: "SUSPENDED" },
    });
    await this.audit.record({
      organizationId,
      actorType: "USER",
      actorId: principal.userId,
      action: "organization.delete",
      targetType: "Organization",
      targetId: organizationId,
      ip: ctx.ip,
    });
  }

  private async loadActive(organizationId: string): Promise<Organization> {
    const org = await this.prisma.base.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
    });
    if (!org) {
      throw Problems.notFound("Organization not found.");
    }
    return org;
  }
}
