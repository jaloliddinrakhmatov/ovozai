import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@ovozai/database";

/**
 * Prisma 7 client wired to PostgreSQL through the `pg` driver adapter.
 * Connections are established lazily (on first query), so the application boots
 * even when the database is unreachable; the readiness probe reports the real
 * status. The connection is closed on shutdown.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    const connectionString =
      config.get<string>("DATABASE_URL") ??
      "postgresql://ovozai:ovozai@localhost:5432/ovozai?schema=public";
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect().catch((error: unknown) => {
      this.logger.debug(`Error during Prisma disconnect: ${String(error)}`);
    });
  }
}
