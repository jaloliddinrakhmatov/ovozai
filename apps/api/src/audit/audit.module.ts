import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";

/** Global so any module can record audit entries without re-importing. */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
