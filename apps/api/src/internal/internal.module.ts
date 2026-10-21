import { Module } from "@nestjs/common";
import { embeddingProvider } from "../knowledge/embedding.provider";
import { InternalAuthGuard } from "./internal-auth.guard";
import { InternalController } from "./internal.controller";
import { InternalService } from "./internal.service";

@Module({
  controllers: [InternalController],
  providers: [InternalService, InternalAuthGuard, embeddingProvider],
})
export class InternalModule {}
