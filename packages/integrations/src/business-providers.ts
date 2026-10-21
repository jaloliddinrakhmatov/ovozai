/**
 * Business-facing provider interfaces for Phase 6 (payments, calendar, CRM,
 * notifications). Each ships a deterministic **mock** default (no keys, for dev
 * and tests) and a documented real-adapter boundary that throws until wired with
 * a provider account/keys.
 */

// --- Payments -------------------------------------------------------------

export interface SubscribeParams {
  organizationId: string;
  planCode: string;
  priceCents: number;
  currency: string;
}

export interface SubscribeResult {
  customerId: string;
  subscriptionId: string;
  status: "ACTIVE" | "TRIALING" | "INCOMPLETE";
}

export interface PaymentProvider {
  readonly name: string;
  subscribe(params: SubscribeParams): Promise<SubscribeResult>;
}

export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock-payments";
  async subscribe(params: SubscribeParams): Promise<SubscribeResult> {
    const org = params.organizationId.slice(0, 8);
    return {
      customerId: `cus_mock_${org}`,
      subscriptionId: `sub_mock_${org}_${params.planCode}`,
      status: "ACTIVE",
    };
  }
}

export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe";
  constructor(private readonly apiKey: string) {}
  async subscribe(): Promise<SubscribeResult> {
    throw new Error(
      "Stripe payments are not wired in this build. Configure STRIPE_* and implement " +
        "subscribe() against the Stripe SDK (see docs/ARCHITECTURE.md).",
    );
  }
}

export function createPaymentProvider(
  config: { provider?: "mock" | "stripe"; apiKey?: string } = {},
): PaymentProvider {
  if (config.provider === "stripe") return new StripePaymentProvider(config.apiKey ?? "");
  return new MockPaymentProvider();
}

// --- Calendar -------------------------------------------------------------

export interface CalendarEventParams {
  organizationId: string;
  title: string;
  startsAt: string;
  endsAt?: string;
  customerName?: string;
}

export interface CalendarEventResult {
  externalEventId: string;
}

export interface CalendarProvider {
  readonly name: string;
  createEvent(params: CalendarEventParams): Promise<CalendarEventResult>;
}

export class MockCalendarProvider implements CalendarProvider {
  readonly name = "mock-calendar";
  async createEvent(): Promise<CalendarEventResult> {
    return { externalEventId: `evt_mock_${Date.now().toString(36)}` };
  }
}

export class GoogleCalendarProvider implements CalendarProvider {
  readonly name = "google-calendar";
  async createEvent(): Promise<CalendarEventResult> {
    throw new Error(
      "Google Calendar is not wired in this build. Configure OAuth credentials and implement " +
        "createEvent() against the Calendar API.",
    );
  }
}

export function createCalendarProvider(
  config: { provider?: "mock" | "google" } = {},
): CalendarProvider {
  if (config.provider === "google") return new GoogleCalendarProvider();
  return new MockCalendarProvider();
}

// --- Notifications --------------------------------------------------------

export interface NotificationMessage {
  channel: "EMAIL" | "SMS" | "IN_APP";
  recipient?: string;
  subject?: string;
  body: string;
}

export interface NotificationResult {
  delivered: boolean;
}

export interface NotificationProvider {
  readonly name: string;
  send(message: NotificationMessage): Promise<NotificationResult>;
}

export class MockNotificationProvider implements NotificationProvider {
  readonly name = "mock-notifier";
  async send(): Promise<NotificationResult> {
    return { delivered: true };
  }
}

export class ExternalNotificationProvider implements NotificationProvider {
  readonly name = "external-notifier";
  async send(message: NotificationMessage): Promise<NotificationResult> {
    // IN_APP is always "delivered" (persisted by the caller); EMAIL/SMS need a
    // provider (SMTP / Twilio) that is not wired in this build.
    if (message.channel === "IN_APP") return { delivered: true };
    throw new Error(
      `Notification channel ${message.channel} is not wired in this build (configure SMTP/SMS).`,
    );
  }
}

export function createNotificationProvider(
  config: { provider?: "mock" | "external" } = {},
): NotificationProvider {
  if (config.provider === "external") return new ExternalNotificationProvider();
  return new MockNotificationProvider();
}
