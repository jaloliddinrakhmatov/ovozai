import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@ovozai/database";
import { tenantExtension } from "../tenancy/tenant.extension";

function withTenantExtension(client: PrismaClient) {
  return client.$extends(tenantExtension);
}

/** The tenant-scoped Prisma client type (base client + tenant-isolation extension). */
export type TenantPrismaClient = ReturnType<typeof withTenantExtension>;

const DEFAULT_DATABASE_URL = "postgresql://ovozai:ovozai@localhost:5432/ovozai?schema=public";

/**
 * Prisma 7 client wired to PostgreSQL through the `pg` driver adapter.
 *
 * Exposes three clients:
 *   - `base`     — unscoped; for global models (User, Organization, Membership,
 *                  Session, AuditLog) and bootstrap/system operations that run
 *                  before a tenant context exists (login, invite acceptance).
 *   - `tenant`   — the base client wrapped with the tenant-isolation extension,
 *                  which auto-scopes tenant-bound models to the active org (the
 *                  PRIMARY, application-layer tenant guard — see tenancy/).
 *   - `enforced` — connects via DATABASE_APP_URL (the non-superuser `ovozai_app`
 *                  role) when set, so PostgreSQL Row-Level Security applies as a
 *                  defense-in-depth backstop (Phase 7). Used through
 *                  `runWithOrgScope`, which binds the `app.current_org` GUC for
 *                  the transaction. When DATABASE_APP_URL is unset it falls back
 *                  to the owner connection (RLS is a no-op for the owner), so the
 *                  helper is safe to call in dev; `rlsEnforced` says which it is.
 *
 * Connections are established lazily (on first query), so the application boots
 * even when the database is unreachable; readiness reports the real status.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  readonly base: PrismaClient;
  readonly tenant: TenantPrismaClient;
  readonly enforced: PrismaClient;
  /** True when `enforced` connects via the dedicated RLS role (DATABASE_APP_URL). */
  readonly rlsEnforced: boolean;

  constructor(config: ConfigService) {
    const connectionString = config.get<string>("DATABASE_URL") ?? DEFAULT_DATABASE_URL;
    this.base = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    this.tenant = withTenantExtension(this.base);

    const appUrl = config.get<string>("DATABASE_APP_URL");
    this.rlsEnforced = Boolean(appUrl);
    this.enforced = this.rlsEnforced
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString: appUrl }) })
      : this.base;
  }

  /**
   * Run `fn` inside a transaction on the RLS-enforced connection with the
   * `app.current_org` GUC bound to `organizationId` (transaction-local). Every
   * tenant table's RLS policy then restricts rows to that organization at the
   * database level, independent of the application-layer guard (defense in depth,
   * Phase 7 / docs/COMPLIANCE.md §1).
   */
  async runWithOrgScope<T>(
    organizationId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.enforced.$transaction(async (tx) => {
      // set_config(..., true) scopes the GUC to this transaction; the tagged
      // template binds organizationId as a parameter (no SQL injection).
      await tx.$executeRaw`SELECT set_config('app.current_org', ${organizationId}, true)`;
      return fn(tx);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.base.$disconnect().catch((error: unknown) => {
      this.logger.debug(`Error during Prisma disconnect: ${String(error)}`);
    });
    if (this.rlsEnforced) {
      await this.enforced.$disconnect().catch((error: unknown) => {
        this.logger.debug(`Error during enforced Prisma disconnect: ${String(error)}`);
      });
    }
  }
}
