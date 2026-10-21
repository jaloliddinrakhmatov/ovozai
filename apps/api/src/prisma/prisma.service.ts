import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@ovozai/database";
import { tenantExtension } from "../tenancy/tenant.extension";

function withTenantExtension(client: PrismaClient) {
  return client.$extends(tenantExtension);
}

/** The tenant-scoped Prisma client type (base client + tenant-isolation extension). */
export type TenantPrismaClient = ReturnType<typeof withTenantExtension>;

/**
 * Prisma 7 client wired to PostgreSQL through the `pg` driver adapter.
 *
 * Exposes two clients over one connection pool:
 *   - `base`   — unscoped; for global models (User, Organization, Membership,
 *                Session, AuditLog) and bootstrap/system operations that run
 *                before a tenant context exists (login, invite acceptance).
 *   - `tenant` — the base client wrapped with the tenant-isolation extension,
 *                which auto-scopes tenant-bound models to the active organization
 *                (see tenancy/tenant.extension.ts).
 *
 * Connections are established lazily (on first query), so the application boots
 * even when the database is unreachable; readiness reports the real status.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  readonly base: PrismaClient;
  readonly tenant: TenantPrismaClient;

  constructor(config: ConfigService) {
    const connectionString =
      config.get<string>("DATABASE_URL") ??
      "postgresql://ovozai:ovozai@localhost:5432/ovozai?schema=public";
    this.base = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    this.tenant = withTenantExtension(this.base);
  }

  async onModuleDestroy(): Promise<void> {
    await this.base.$disconnect().catch((error: unknown) => {
      this.logger.debug(`Error during Prisma disconnect: ${String(error)}`);
    });
  }
}
