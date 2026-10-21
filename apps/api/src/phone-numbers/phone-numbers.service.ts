import { Injectable } from "@nestjs/common";
import type {
  CreatePhoneNumberRequest,
  PhoneNumberDto,
  PhoneNumberListQuery,
  UpdatePhoneNumberRequest,
} from "@ovozai/contracts";
import { AuditService } from "../audit/audit.service";
import { Problems } from "../common/problem.exception";
import { toPhoneNumberDto } from "../common/mappers";
import { isUniqueViolation } from "../common/prisma-errors";
import type { RequestMeta } from "../common/request-context";
import type { UserPrincipal } from "../common/principal.types";
import { PrismaService } from "../prisma/prisma.service";

interface Page<T> {
  data: T[];
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
}

@Injectable()
export class PhoneNumbersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: PhoneNumberListQuery): Promise<Page<PhoneNumberDto>> {
    const take = query.limit;
    const rows = await this.prisma.tenant.phoneNumber.findMany({
      where: query.status ? { status: query.status } : {},
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > take;
    const page = hasNextPage ? rows.slice(0, take) : rows;
    return {
      data: page.map(toPhoneNumberDto),
      pageInfo: { nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null, hasNextPage },
    };
  }

  async create(
    principal: UserPrincipal,
    organizationId: string,
    dto: CreatePhoneNumberRequest,
    ctx: RequestMeta,
  ): Promise<PhoneNumberDto> {
    if (dto.agentId) await this.assertAgentExists(dto.agentId);
    let number;
    try {
      number = await this.prisma.tenant.phoneNumber.create({
        data: {
          organizationId,
          e164: dto.e164,
          provider: dto.provider,
          agentId: dto.agentId ?? null,
          capabilities: dto.capabilities ?? ["voice"],
          status: "ACTIVE",
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw Problems.conflict("That phone number is already provisioned.");
      }
      throw error;
    }
    await this.audit.record({
      organizationId,
      actorId: principal.userId,
      action: "phone_number.provision",
      targetType: "PhoneNumber",
      targetId: number.id,
      metadata: { e164: dto.e164, provider: dto.provider },
      ip: ctx.ip,
    });
    return toPhoneNumberDto(number);
  }

  async update(
    principal: UserPrincipal,
    organizationId: string,
    id: string,
    dto: UpdatePhoneNumberRequest,
    ctx: RequestMeta,
  ): Promise<PhoneNumberDto> {
    await this.load(id);
    if (dto.agentId) await this.assertAgentExists(dto.agentId);
    const result = await this.prisma.tenant.phoneNumber.updateMany({
      where: { id },
      data: {
        status: dto.status,
        capabilities: dto.capabilities,
        ...(dto.agentId !== undefined ? { agentId: dto.agentId } : {}),
      },
    });
    if (result.count === 0) throw Problems.notFound("Phone number not found.");
    await this.audit.record({
      organizationId,
      actorId: principal.userId,
      action: "phone_number.update",
      targetType: "PhoneNumber",
      targetId: id,
      ip: ctx.ip,
    });
    return toPhoneNumberDto(await this.load(id));
  }

  async release(
    principal: UserPrincipal,
    organizationId: string,
    id: string,
    ctx: RequestMeta,
  ): Promise<void> {
    const result = await this.prisma.tenant.phoneNumber.updateMany({
      where: { id },
      data: { status: "RELEASED", deletedAt: new Date() },
    });
    if (result.count === 0) throw Problems.notFound("Phone number not found.");
    await this.audit.record({
      organizationId,
      actorId: principal.userId,
      action: "phone_number.release",
      targetType: "PhoneNumber",
      targetId: id,
      ip: ctx.ip,
    });
  }

  private async load(id: string) {
    const number = await this.prisma.tenant.phoneNumber.findFirst({ where: { id } });
    if (!number) throw Problems.notFound("Phone number not found.");
    return number;
  }

  private async assertAgentExists(agentId: string): Promise<void> {
    const agent = await this.prisma.tenant.agent.findFirst({ where: { id: agentId } });
    if (!agent) throw Problems.unprocessable("The referenced agent does not exist.");
  }
}
