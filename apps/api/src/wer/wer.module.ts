import { Module } from "@nestjs/common";
import { WerController } from "./wer.controller";
import { WerService } from "./wer.service";

@Module({
  controllers: [WerController],
  providers: [WerService],
})
export class WerModule {}
