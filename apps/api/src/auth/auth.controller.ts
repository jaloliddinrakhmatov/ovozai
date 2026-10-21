import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import {
  loginRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
  switchOrgRequestSchema,
  type AuthSession,
  type AuthTokens,
  type LoginRequest,
  type MeResponse,
  type RefreshRequest,
  type RegisterRequest,
  type SwitchOrgRequest,
} from "@ovozai/contracts";
import { CurrentPrincipal } from "../common/current-principal.decorator";
import { Public } from "../common/public.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { RequestWithContext, UserPrincipal } from "../common/principal.types";
import { AuthService, type RequestContext } from "./auth.service";
import { AuthRateLimitGuard } from "./auth-rate-limit.guard";

function contextFrom(req: RequestWithContext): RequestContext {
  const userAgentRaw = req.headers["user-agent"];
  return {
    userAgent: Array.isArray(userAgentRaw) ? userAgentRaw[0] : userAgentRaw,
    ip: req.ip,
  };
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @UseGuards(AuthRateLimitGuard)
  @Post("register")
  register(
    @Body(new ZodValidationPipe(registerRequestSchema)) body: RegisterRequest,
    @Req() req: RequestWithContext,
  ): Promise<AuthSession> {
    return this.auth.register(body, contextFrom(req));
  }

  @Public()
  @UseGuards(AuthRateLimitGuard)
  @Post("login")
  login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Req() req: RequestWithContext,
  ): Promise<AuthSession> {
    return this.auth.login(body, contextFrom(req));
  }

  @Public()
  @UseGuards(AuthRateLimitGuard)
  @Post("refresh")
  refresh(
    @Body(new ZodValidationPipe(refreshRequestSchema)) body: RefreshRequest,
    @Req() req: RequestWithContext,
  ): Promise<AuthTokens> {
    return this.auth.refresh(body, contextFrom(req));
  }

  @Post("logout")
  @HttpCode(204)
  logout(
    @CurrentPrincipal() principal: UserPrincipal,
    @Req() req: RequestWithContext,
  ): Promise<void> {
    return this.auth.logout(principal, contextFrom(req));
  }

  @Post("switch-org")
  switchOrg(
    @CurrentPrincipal() principal: UserPrincipal,
    @Body(new ZodValidationPipe(switchOrgRequestSchema)) body: SwitchOrgRequest,
    @Req() req: RequestWithContext,
  ): Promise<AuthSession> {
    return this.auth.switchOrg(principal, body, contextFrom(req));
  }

  @Get("me")
  me(@CurrentPrincipal() principal: UserPrincipal): Promise<MeResponse> {
    return this.auth.me(principal);
  }
}
