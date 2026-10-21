import { Controller, Get } from "@nestjs/common";
import type { WerSummaryResponse } from "@ovozai/contracts";
import { Roles } from "../common/roles.decorator";
import { WerService } from "./wer.service";

@Controller("wer")
export class WerController {
  constructor(private readonly wer: WerService) {}

  @Get("summary")
  @Roles("VIEWER")
  summary(): Promise<WerSummaryResponse> {
    return this.wer.summary();
  }
}
