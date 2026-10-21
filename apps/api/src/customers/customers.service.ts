import { Injectable } from "@nestjs/common";
import { Prisma } from "@ovozai/database";
import type {
  CreateCustomerRequest,
  CustomerDto,
  CustomerListQuery,
  UpdateCustomerRequest,
} from "@ovozai/contracts";
import { AuditService } from "../audit/audit.service";
import { Problems } from "../common/problem.exception";
import { toCustomerDto } from "../common/mappers";
import type { RequestMeta } from "../common/request-context";
import type { UserPrincipal } from "../common/principal.types";
import { PrismaService } from "../prisma/prisma.service";

interface Page<T> {
  data: T[];
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: CustomerListQuery): Promise<Page<CustomerDto>> {
    const where: Prisma.CustomerWhereInput = {};
    if (query.phoneE164) where.phoneE164 = { contains: query.phoneE164 };
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: "insensitive" } },
        { phoneE164: { contains: query.q } },
        { email: { contains: query.q, mode: "insensitive" } },
      ];
    }

    const take = query.limit;
    const rows = await this.prisma.tenant.customer.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > take;
    const page = hasNextPage ? rows.slice(0, take) : rows;
    return {
      data: page.map(toCustomerDto),
      pageInfo: { nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null, hasNextPage },
    };
  }

  async get(id: string): Promise<CustomerDto> {
    return toCustomerDto(await this.load(id));
  }

  async create(
    principal: UserPrincipal,
    organizationId: string,
    dto: CreateCustomerRequest,
    ctx: RequestMeta,
  ): Promise<CustomerDto> {
    const customer = await this.prisma.tenant.customer.create({
      data: {
        organizationId,
        phoneE164: dto.phoneE164,
        name: dto.name,
        email: dto.email,
        locale: dto.locale ?? "uz",
        notes: dto.notes,
        tags: dto.tags ?? [],
      },
    });
    await this.audit.record({
      organizationId,
      actorId: principal.userId,
      action: "customer.create",
      targetType: "Customer",
      targetId: customer.id,
      ip: ctx.ip,
    });
    return toCustomerDto(customer);
  }

  async update(
    principal: UserPrincipal,
    organizationId: string,
    id: string,
    dto: UpdateCustomerRequest,
    ctx: RequestMeta,
  ): Promise<CustomerDto> {
    await this.load(id);
    const result = await this.prisma.tenant.customer.updateMany({
      where: { id },
      data: {
        phoneE164: dto.phoneE164,
        name: dto.name,
        email: dto.email,
        locale: dto.locale,
        notes: dto.notes,
        tags: dto.tags,
      },
    });
    if (result.count === 0) throw Problems.notFound("Customer not found.");
    await this.audit.record({
      organizationId,
      actorId: principal.userId,
      action: "customer.update",
      targetType: "Customer",
      targetId: id,
      ip: ctx.ip,
    });
    return toCustomerDto(await this.load(id));
  }

  async softDelete(
    principal: UserPrincipal,
    organizationId: string,
    id: string,
    ctx: RequestMeta,
  ): Promise<void> {
    const result = await this.prisma.tenant.customer.updateMany({
      where: { id },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) throw Problems.notFound("Customer not found.");
    await this.audit.record({
      organizationId,
      actorId: principal.userId,
      action: "customer.delete",
      targetType: "Customer",
      targetId: id,
      ip: ctx.ip,
    });
  }

  private async load(id: string) {
    const customer = await this.prisma.tenant.customer.findFirst({ where: { id } });
    if (!customer) throw Problems.notFound("Customer not found.");
    return customer;
  }
}
