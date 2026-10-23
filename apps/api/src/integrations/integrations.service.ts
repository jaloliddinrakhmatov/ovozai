import { createHmac, timingSafeEqual } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  buildGoogleAuthUrl,
  createGoogleCalendarEvent,
  exchangeGoogleCode,
  type CalendarProvider,
} from "@ovozai/integrations";
import type { CreateIntegrationRequest, IntegrationDto, PaginationQuery } from "@ovozai/contracts";
import { Prisma } from "@ovozai/database";
import { AuditService } from "../audit/audit.service";
import { Problems } from "../common/problem.exception";
import { toIntegrationDto } from "../common/mappers";
import type { RequestMeta } from "../common/request-context";
import type { UserPrincipal } from "../common/principal.types";
import { PrismaService } from "../prisma/prisma.service";
import { CALENDAR_PROVIDER } from "./calendar.provider";

interface Page<T> {
  data: T[];
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
}

export interface CalendarSyncInput {
  title: string;
  startsAt: string;
  endsAt?: string;
  customerName?: string;
}

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    @Inject(CALENDAR_PROVIDER) private readonly calendar: CalendarProvider,
  ) {}

  async list(query: PaginationQuery): Promise<Page<IntegrationDto>> {
    const take = query.limit;
    const rows = await this.prisma.tenant.integration.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > take;
    const page = hasNextPage ? rows.slice(0, take) : rows;
    return {
      data: page.map(toIntegrationDto),
      pageInfo: { nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null, hasNextPage },
    };
  }

  async connect(
    principal: UserPrincipal,
    organizationId: string,
    dto: CreateIntegrationRequest,
    ctx: RequestMeta,
  ): Promise<IntegrationDto> {
    // The API key (if supplied) is never persisted in the clear: a reference is
    // stored (prod resolves it from the secret store — docs/SECURITY.md §5).
    const secretRef = dto.apiKey ? `secret:${dto.type.toLowerCase()}:${dto.provider}` : null;
    const integration = await this.prisma.tenant.integration.create({
      data: {
        organizationId,
        type: dto.type,
        provider: dto.provider,
        status: "CONNECTED",
        config: (dto.config ?? {}) as Prisma.InputJsonValue,
        secretRef,
      },
    });
    await this.audit.record({
      organizationId,
      actorId: principal.userId,
      action: "integration.connect",
      targetType: "Integration",
      targetId: integration.id,
      metadata: { type: dto.type, provider: dto.provider },
      ip: ctx.ip,
    });
    return toIntegrationDto(integration);
  }

  async disconnect(
    principal: UserPrincipal,
    organizationId: string,
    id: string,
    ctx: RequestMeta,
  ): Promise<void> {
    const result = await this.prisma.tenant.integration.updateMany({
      where: { id },
      data: { status: "DISCONNECTED", deletedAt: new Date() },
    });
    if (result.count === 0) throw Problems.notFound("Integration not found.");
    await this.audit.record({
      organizationId,
      actorId: principal.userId,
      action: "integration.disconnect",
      targetType: "Integration",
      targetId: id,
      ip: ctx.ip,
    });
  }

  // --- Google Calendar OAuth (per-org connect) ---------------------------

  /** The Google consent URL to start a connect flow for this org. */
  getGoogleCalendarAuthUrl(organizationId: string): { url: string } {
    const clientId = this.config.get<string>("GOOGLE_CLIENT_ID");
    const redirectUri = this.config.get<string>("GOOGLE_REDIRECT_URI") ?? "";
    if (!clientId) {
      throw Problems.unprocessable(
        "Google Calendar is not configured on the server (set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).",
      );
    }
    return { url: buildGoogleAuthUrl({ clientId, redirectUri, state: this.signState(organizationId) }) };
  }

  /**
   * Handle Google's OAuth redirect: verify state, exchange the code for a refresh
   * token, and store it on the org's CALENDAR integration. Returns the dashboard
   * URL to redirect the browser to. No auth context here (public callback), so it
   * uses the base client with the org recovered from the signed state.
   */
  async handleGoogleCalendarCallback(code?: string, state?: string, error?: string): Promise<string> {
    const webUrl = (this.config.get<string>("APP_WEB_URL") ?? "http://localhost:3000").replace(/\/$/, "");
    const fail = (reason: string) =>
      `${webUrl}/dashboard/integrations?calendar=error&reason=${encodeURIComponent(reason)}`;

    if (error) return fail(error);
    if (!code || !state) return fail("missing_code");
    const organizationId = this.verifyState(state);
    if (!organizationId) return fail("invalid_state");

    const clientId = this.config.get<string>("GOOGLE_CLIENT_ID") ?? "";
    const clientSecret = this.config.get<string>("GOOGLE_CLIENT_SECRET") ?? "";
    const redirectUri = this.config.get<string>("GOOGLE_REDIRECT_URI") ?? "";
    try {
      const tokens = await exchangeGoogleCode({ clientId, clientSecret, code, redirectUri });
      if (!tokens.refreshToken) return fail("no_refresh_token");

      // NOTE: the refresh token is stored in `config` for this dev build; in
      // production it belongs in a KMS-backed secret store (docs/SECURITY.md).
      const config = {
        refreshToken: tokens.refreshToken,
        calendarId: "primary",
        connectedAt: new Date().toISOString(),
      } satisfies Record<string, unknown>;

      const existing = await this.prisma.base.integration.findFirst({
        where: { organizationId, type: "CALENDAR", provider: "google" },
      });
      let integrationId: string;
      if (existing) {
        await this.prisma.base.integration.update({
          where: { id: existing.id },
          data: { status: "CONNECTED", deletedAt: null, config: config as Prisma.InputJsonValue },
        });
        integrationId = existing.id;
      } else {
        const created = await this.prisma.base.integration.create({
          data: {
            organizationId,
            type: "CALENDAR",
            provider: "google",
            status: "CONNECTED",
            config: config as Prisma.InputJsonValue,
            secretRef: "google-oauth-refresh",
          },
        });
        integrationId = created.id;
      }
      await this.audit.record({
        organizationId,
        actorType: "SYSTEM",
        action: "integration.google_calendar.connect",
        targetType: "Integration",
        targetId: integrationId,
      });
      return `${webUrl}/dashboard/integrations?calendar=connected`;
    } catch (e) {
      this.logger.warn(`Google Calendar connect failed for org ${organizationId}: ${String(e)}`);
      return fail("exchange_failed");
    }
  }

  private signState(organizationId: string): string {
    const exp = Math.floor(Date.now() / 1000) + 600; // 10 minutes
    const payload = `${organizationId}.${exp}`;
    const secret = this.config.get<string>("INTERNAL_HMAC_SECRET") ?? "";
    const sig = createHmac("sha256", secret).update(payload).digest("base64url");
    return Buffer.from(`${payload}.${sig}`).toString("base64url");
  }

  private verifyState(state: string): string | null {
    try {
      const [organizationId, expStr, sig] = Buffer.from(state, "base64url").toString("utf8").split(".");
      if (!organizationId || !expStr || !sig) return null;
      const secret = this.config.get<string>("INTERNAL_HMAC_SECRET") ?? "";
      const expected = createHmac("sha256", secret).update(`${organizationId}.${expStr}`).digest("base64url");
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
      if (Number(expStr) * 1000 < Date.now()) return null;
      return organizationId;
    } catch {
      return null;
    }
  }

  /**
   * Sync an appointment to the org's connected calendar, returning the external
   * event id (or null if no calendar is connected). Best-effort; base client +
   * explicit org so it is callable from request + internal contexts. Uses the
   * real Google Calendar API when a Google integration is connected, else the
   * configured (mock) provider.
   */
  async syncAppointmentToCalendar(organizationId: string, input: CalendarSyncInput): Promise<string | null> {
    const integration = await this.prisma.base.integration.findFirst({
      where: { organizationId, type: "CALENDAR", status: "CONNECTED", deletedAt: null },
    });
    if (!integration) return null;
    try {
      if (integration.provider === "google") {
        const cfg = (integration.config ?? {}) as Record<string, unknown>;
        const refreshToken = typeof cfg.refreshToken === "string" ? cfg.refreshToken : "";
        const clientId = this.config.get<string>("GOOGLE_CLIENT_ID") ?? "";
        const clientSecret = this.config.get<string>("GOOGLE_CLIENT_SECRET") ?? "";
        if (!refreshToken || !clientId || !clientSecret) return null;
        const result = await createGoogleCalendarEvent({
          clientId,
          clientSecret,
          refreshToken,
          calendarId: typeof cfg.calendarId === "string" ? cfg.calendarId : "primary",
          event: {
            title: input.title,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            description: input.customerName
              ? `Booked for ${input.customerName} via OvozAI`
              : "Booked via OvozAI",
            timezone: "Asia/Tashkent",
          },
        });
        return result.externalEventId;
      }
      const result = await this.calendar.createEvent({ organizationId, ...input });
      return result.externalEventId;
    } catch (error) {
      this.logger.warn(`Calendar sync failed for org ${organizationId}: ${String(error)}`);
      return null;
    }
  }
}
