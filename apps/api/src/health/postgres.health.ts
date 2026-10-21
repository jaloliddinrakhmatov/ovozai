import { Injectable } from "@nestjs/common";
import { HealthIndicatorService, type HealthIndicatorResult } from "@nestjs/terminus";
import { PrismaService } from "../prisma/prisma.service";

/** Readiness check for PostgreSQL: runs `SELECT 1` through Prisma, with a timeout. */
@Injectable()
export class PostgresHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly prisma: PrismaService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    try {
      await Promise.race([
        this.prisma.base.$queryRaw`SELECT 1`,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("PostgreSQL ping timed out")), 2000),
        ),
      ]);
      return indicator.up();
    } catch (error) {
      return indicator.down({
        message: error instanceof Error ? error.message : "PostgreSQL is not reachable",
      });
    }
  }
}
