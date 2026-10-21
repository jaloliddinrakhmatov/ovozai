import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@ovozai/database";
import { PrismaService } from "../prisma/prisma.service";

export type AuditActorType = "USER" | "API_KEY" | "SYSTEM";

export interface AuditEntry {
  organizationId?: string | null;
  actorType?: AuditActorType;
  actorId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

/**
 * Append-only security/compliance audit trail (docs/SECURITY.md §10). Writes go
 * through the unscoped base client with an explicit (possibly null) organization,
 * since some audited actions precede a tenant context (e.g. login). Failures are
 * logged but never propagated — auditing must not break the audited action.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.base.auditLog.create({
        data: {
          organizationId: entry.organizationId ?? null,
          actorType: entry.actorType ?? "USER",
          actorId: entry.actorId ?? null,
          action: entry.action,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId ?? null,
          metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          ip: entry.ip ?? null,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to write audit log for "${entry.action}": ${String(error)}`);
    }
  }
}
