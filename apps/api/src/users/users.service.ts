import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/** Identity & profile operations over the global `User` model. */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.base.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  findById(id: string) {
    return this.prisma.base.user.findUnique({ where: { id } });
  }

  createUser(params: { email: string; name?: string; hashedPassword?: string | null }) {
    return this.prisma.base.user.create({
      data: {
        email: params.email.toLowerCase(),
        name: params.name,
        hashedPassword: params.hashedPassword ?? null,
      },
    });
  }

  touchLastLogin(id: string) {
    return this.prisma.base.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
  }

  /** The user's memberships (active orgs only), with each organization included. */
  loadMemberships(userId: string) {
    return this.prisma.base.membership.findMany({
      where: { userId, organization: { deletedAt: null } },
      include: { organization: true },
      orderBy: { createdAt: "asc" },
    });
  }
}
