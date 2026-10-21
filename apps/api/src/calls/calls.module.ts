import { Module } from "@nestjs/common";
import { CallsController } from "./calls.controller";
import { CallsService } from "./calls.service";
import { storageProvider } from "./storage.provider";

@Module({
  controllers: [CallsController],
  providers: [CallsService, storageProvider],
})
export class CallsModule {}
