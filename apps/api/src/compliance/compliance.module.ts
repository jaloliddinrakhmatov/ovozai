import { Module } from "@nestjs/common";
import { storageProvider } from "../calls/storage.provider";
import { ComplianceController } from "./compliance.controller";
import { ComplianceService } from "./compliance.service";
import { RetentionQueue } from "./retention.queue";

/**
 * Data-protection & compliance (Phase 7): retention policy, right-to-erasure, and
 * the retention-sweep trigger. PrismaService + AuditService come from their global
 * modules; the storage provider is reused from the calls module's factory.
 */
@Module({
  controllers: [ComplianceController],
  providers: [ComplianceService, RetentionQueue, storageProvider],
})
export class ComplianceModule {}
