import { Inject, Injectable, Logger } from "@nestjs/common";
import type { StorageProvider } from "@ovozai/integrations";
import type {
  ErasureRequest,
  ErasureResult,
  RetentionPolicy,
  RlsStatus,
  UpdateRetentionPolicyRequest,
} from "@ovozai/contracts";
import { AuditService } from "../audit/audit.service";
import { Problems } from "../common/problem.exception";
import type { RequestMeta } from "../common/request-context";
import type { UserPrincipal } from "../common/principal.types";
import { PrismaService } from "../prisma/prisma.service";
import { STORAGE_PROVIDER } from "../calls/storage.provider";
import { RetentionQueue } from "./retention.queue";

/**
 * Data-protection operations (Phase 7, docs/COMPLIANCE.md §3): per-organization
 * retention policy, right-to-erasure of a customer's personal data, and triggering
 * the (async) retention sweep. Retention reads/writes the (global) Organization via
 * the base client; erasure runs through the tenant client so every delete is
 * org-scoped.
 */
@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly retentionQueue: RetentionQueue,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async getRetentionPolicy(organizationId: string): Promise<RetentionPolicy> {
    const org = await this.prisma.base.organization.findUnique({
      where: { id: organizationId },
      select: { recordingRetentionDays: true, transcriptRetentionDays: true },
    });
    if (!org) throw Problems.notFound("Organization not found.");
    return {
      recordingRetentionDays: org.recordingRetentionDays,
      transcriptRetentionDays: org.transcriptRetentionDays,
    };
  }

  async setRetentionPolicy(
    principal: UserPrincipal,
    organizationId: string,
    dto: UpdateRetentionPolicyRequest,
    ctx: RequestMeta,
  ): Promise<RetentionPolicy> {
    const org = await this.prisma.base.organization.update({
      where: { id: organizationId },
      data: {
        ...(dto.recordingRetentionDays !== undefined
          ? { recordingRetentionDays: dto.recordingRetentionDays }
          : {}),
        ...(dto.transcriptRetentionDays !== undefined
          ? { transcriptRetentionDays: dto.transcriptRetentionDays }
          : {}),
      },
      select: { recordingRetentionDays: true, transcriptRetentionDays: true },
    });
    await this.audit.record({
      organizationId,
      actorId: principal.userId,
      action: "retention.policy.updated",
      targetType: "Organization",
      targetId: organizationId,
      metadata: {
        recordingRetentionDays: org.recordingRetentionDays,
        transcriptRetentionDays: org.transcriptRetentionDays,
      },
      ip: ctx.ip,
    });
    return {
      recordingRetentionDays: org.recordingRetentionDays,
      transcriptRetentionDays: org.transcriptRetentionDays,
    };
  }

  /**
   * Right-to-erasure for one customer: delete their transcripts + recordings,
   * redact the call ledger (keep the rows for billing integrity, strip the PII),
   * and anonymize the customer record. Audited. Idempotent-ish (re-running on an
   * already-anonymized customer simply finds nothing more to remove).
   */
  async eraseCustomer(
    principal: UserPrincipal,
    dto: ErasureRequest,
    ctx: RequestMeta,
  ): Promise<ErasureResult> {
    const customer = await this.prisma.tenant.customer.findFirst({ where: { id: dto.customerId } });
    if (!customer) throw Problems.notFound("Customer not found.");

    // Capture the affected calls (and their recording keys) up front.
    const calls = await this.prisma.tenant.call.findMany({
      where: { customerId: customer.id },
      select: { id: true, recordingObjectKey: true },
    });
    const callIds = calls.map((c) => c.id);

    let deletedTranscriptTurns = 0;
    let deletedTranscripts = 0;
    if (callIds.length > 0) {
      const transcripts = await this.prisma.tenant.transcript.findMany({
        where: { callId: { in: callIds } },
        select: { id: true },
      });
      const transcriptIds = transcripts.map((t) => t.id);
      if (transcriptIds.length > 0) {
        deletedTranscriptTurns = (
          await this.prisma.tenant.transcriptTurn.deleteMany({
            where: { transcriptId: { in: transcriptIds } },
          })
        ).count;
      }
      deletedTranscripts = (
        await this.prisma.tenant.transcript.deleteMany({ where: { callId: { in: callIds } } })
      ).count;
    }

    // Delete recording objects (best-effort per key) and strip the PII fields
    // from the retained call ledger rows.
    let deletedRecordings = 0;
    for (const call of calls) {
      if (!call.recordingObjectKey) continue;
      try {
        await this.storage.delete(call.recordingObjectKey);
        deletedRecordings += 1;
      } catch (error) {
        this.logger.error(`Failed to delete recording ${call.recordingObjectKey}: ${String(error)}`);
      }
    }
    let redactedCalls = 0;
    if (callIds.length > 0) {
      redactedCalls = (
        await this.prisma.tenant.call.updateMany({
          where: { id: { in: callIds } },
          data: { fromE164: null, recordingObjectKey: null, customerId: null },
        })
      ).count;
    }

    // Anonymize the customer record itself (phone must stay non-null — replace
    // with a non-identifying token so the row count/integrity is preserved).
    await this.prisma.tenant.customer.updateMany({
      where: { id: customer.id },
      data: {
        phoneE164: `erased:${customer.id}`,
        name: null,
        email: null,
        notes: null,
        tags: [],
        lastContactedAt: null,
        deletedAt: new Date(),
      },
    });

    const result: ErasureResult = {
      customerId: customer.id,
      anonymizedCustomer: true,
      redactedCalls,
      deletedTranscripts,
      deletedTranscriptTurns,
      deletedRecordings,
    };
    await this.audit.record({
      organizationId: principal.organizationId ?? undefined,
      actorId: principal.userId,
      action: "customer.erased",
      targetType: "Customer",
      targetId: customer.id,
      metadata: { reason: dto.reason, ...result },
      ip: ctx.ip,
    });
    return result;
  }

  /**
   * Exercise the RLS-enforced connection to prove tenant isolation at the DB
   * layer (Phase 7). Counts customers visible through `runWithOrgScope` for the
   * caller's own org vs a different org context — when RLS is enforced the latter
   * is always 0, independent of the application-layer guard.
   */
  async rlsStatus(organizationId: string): Promise<RlsStatus> {
    const FOREIGN_ORG = "00000000-0000-0000-0000-000000000000";
    const selfOrgVisibleCustomers = await this.prisma.runWithOrgScope(organizationId, (tx) =>
      tx.customer.count(),
    );
    const foreignOrgVisibleCustomers = await this.prisma.runWithOrgScope(FOREIGN_ORG, (tx) =>
      tx.customer.count(),
    );
    return {
      rlsEnforced: this.prisma.rlsEnforced,
      selfOrgVisibleCustomers,
      foreignOrgVisibleCustomers,
    };
  }

  /** Enqueue a retention sweep for the org (the jobs-worker performs the purge). */
  async triggerSweep(organizationId: string): Promise<{ queued: true }> {
    await this.retentionQueue.enqueue({ organizationId });
    return { queued: true };
  }
}
