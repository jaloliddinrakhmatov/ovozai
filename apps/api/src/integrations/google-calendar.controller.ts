import { Controller, Get, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../common/public.decorator";
import { IntegrationsService } from "./integrations.service";

/**
 * Google's OAuth redirect lands here. It carries no OvozAI session, so this
 * controller is `@Public()` and lives apart from the ADMIN-guarded
 * `IntegrationsController`. The org is recovered from the signed `state`.
 */
@Controller("integrations/google/calendar")
export class GoogleCalendarController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Public()
  @Get("callback")
  async callback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const redirect = await this.integrations.handleGoogleCalendarCallback(code, state, error);
    res.redirect(redirect);
  }
}
