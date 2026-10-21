import { Injectable } from "@nestjs/common";
import { Prisma } from "@ovozai/database";
import type {
  AgentDto,
  AgentVersionDto,
  CreateAgentRequest,
  PaginationQuery,
  UpdateAgentRequest,
} from "@ovozai/contracts";
import { AuditService } from "../audit/audit.service";
import { Problems } from "../common/problem.exception";
import { toAgentDto, toAgentVersionDto } from "../common/mappers";
import type { RequestMeta } from "../common/request-context";
import type { UserPrincipal } from "../common/principal.types";
import { PrismaService } from "../prisma/prisma.service";
import { PlanLimitsService } from "../billing/plan-limits.service";

interface Page<T> {
  data: T[];
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
}

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  async list(query: PaginationQuery): Promise<Page<AgentDto>> {
    const take = query.limit;
    const rows = await this.prisma.tenant.agent.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    return this.toPage(rows, take, toAgentDto);
  }

  async get(id: string): Promise<AgentDto> {
    return toAgentDto(await this.load(id));
  }

  async create(
    principal: UserPrincipal,
    organizationId: string,
    dto: CreateAgentRequest,
    ctx: RequestMeta,
  ): Promise<AgentDto> {
    await this.planLimits.assertCanCreateAgent(organizationId);
    const agent = await this.prisma.tenant.agent.create({
      data: {
        organizationId,
        name: dto.name,
        defaultLanguage: dto.defaultLanguage,
        systemPrompt: dto.systemPrompt,
        voiceId: dto.voiceId,
        greeting: dto.greeting,
        transferNumber: dto.transferNumber,
        config: (dto.config ?? {}) as Prisma.InputJsonValue,
      },
    });
    await this.audit.record({
      organizationId,
      actorId: principal.userId,
      action: "agent.create",
      targetType: "Agent",
      targetId: agent.id,
      ip: ctx.ip,
    });
    return toAgentDto(agent);
  }

  async update(
    principal: UserPrincipal,
    organizationId: string,
    id: string,
    dto: UpdateAgentRequest,
    ctx: RequestMeta,
  ): Promise<AgentDto> {
    await this.load(id);
    const result = await this.prisma.tenant.agent.updateMany({
      where: { id },
      data: {
        name: dto.name,
        status: dto.status,
        defaultLanguage: dto.defaultLanguage,
        systemPrompt: dto.systemPrompt,
        voiceId: dto.voiceId,
        greeting: dto.greeting,
        transferNumber: dto.transferNumber,
        ...(dto.config !== undefined ? { config: dto.config as Prisma.InputJsonValue } : {}),
      },
    });
    if (result.count === 0) throw Problems.notFound("Agent not found.");
    await this.audit.record({
      organizationId,
      actorId: principal.userId,
      action: "agent.update",
      targetType: "Agent",
      targetId: id,
      ip: ctx.ip,
    });
    return toAgentDto(await this.load(id));
  }

  async softDelete(
    principal: UserPrincipal,
    organizationId: string,
    id: string,
    ctx: RequestMeta,
  ): Promise<void> {
    const result = await this.prisma.tenant.agent.updateMany({
      where: { id },
      data: { deletedAt: new Date(), status: "ARCHIVED" },
    });
    if (result.count === 0) throw Problems.notFound("Agent not found.");
    await this.audit.record({
      organizationId,
      actorId: principal.userId,
      action: "agent.delete",
      targetType: "Agent",
      targetId: id,
      ip: ctx.ip,
    });
  }

  /** Snapshot the agent's current configuration into a new immutable version. */
  async publish(
    principal: UserPrincipal,
    organizationId: string,
    id: string,
    ctx: RequestMeta,
  ): Promise<AgentVersionDto> {
    const agent = await this.load(id);
    const latest = await this.prisma.tenant.agentVersion.findMany({
      where: { agentId: id },
      orderBy: { version: "desc" },
      take: 1,
    });
    const nextVersion = (latest[0]?.version ?? 0) + 1;
    const snapshot = {
      name: agent.name,
      status: agent.status,
      defaultLanguage: agent.defaultLanguage,
      systemPrompt: agent.systemPrompt,
      voiceId: agent.voiceId,
      greeting: agent.greeting,
      transferNumber: agent.transferNumber,
      config: agent.config ?? {},
    };
    const version = await this.prisma.tenant.agentVersion.create({
      data: {
        organizationId,
        agentId: id,
        version: nextVersion,
        config: snapshot as Prisma.InputJsonValue,
      },
    });
    await this.audit.record({
      organizationId,
      actorId: principal.userId,
      action: "agent.publish",
      targetType: "AgentVersion",
      targetId: version.id,
      metadata: { agentId: id, version: nextVersion },
      ip: ctx.ip,
    });
    return toAgentVersionDto(version);
  }

  async listVersions(id: string, query: PaginationQuery): Promise<Page<AgentVersionDto>> {
    await this.load(id);
    const take = query.limit;
    const rows = await this.prisma.tenant.agentVersion.findMany({
      where: { agentId: id },
      orderBy: [{ version: "desc" }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    return this.toPage(rows, take, toAgentVersionDto);
  }

  /** Restore a published version's configuration back onto the agent. */
  async restoreVersion(
    principal: UserPrincipal,
    organizationId: string,
    id: string,
    version: number,
    ctx: RequestMeta,
  ): Promise<AgentDto> {
    await this.load(id);
    const rows = await this.prisma.tenant.agentVersion.findMany({
      where: { agentId: id, version },
      take: 1,
    });
    const snapshot = rows[0]?.config as Record<string, unknown> | undefined;
    if (!snapshot) throw Problems.notFound("Agent version not found.");

    const lang = snapshot.defaultLanguage;
    const defaultLanguage = lang === "UZ" || lang === "RU" || lang === "EN" ? lang : undefined;

    await this.prisma.tenant.agent.updateMany({
      where: { id },
      data: {
        name: typeof snapshot.name === "string" ? snapshot.name : undefined,
        defaultLanguage,
        systemPrompt: (snapshot.systemPrompt ?? null) as string | null,
        voiceId: (snapshot.voiceId ?? null) as string | null,
        greeting: (snapshot.greeting ?? null) as string | null,
        transferNumber: (snapshot.transferNumber ?? null) as string | null,
        config: (snapshot.config ?? {}) as Prisma.InputJsonValue,
      },
    });
    await this.audit.record({
      organizationId,
      actorId: principal.userId,
      action: "agent.restore_version",
      targetType: "Agent",
      targetId: id,
      metadata: { version },
      ip: ctx.ip,
    });
    return toAgentDto(await this.load(id));
  }

  private async load(id: string) {
    const agent = await this.prisma.tenant.agent.findFirst({ where: { id } });
    if (!agent) throw Problems.notFound("Agent not found.");
    return agent;
  }

  private toPage<Row extends { id: string }, T>(
    rows: Row[],
    take: number,
    map: (row: Row) => T,
  ): Page<T> {
    const hasNextPage = rows.length > take;
    const page = hasNextPage ? rows.slice(0, take) : rows;
    return {
      data: page.map(map),
      pageInfo: {
        nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null,
        hasNextPage,
      },
    };
  }
}
