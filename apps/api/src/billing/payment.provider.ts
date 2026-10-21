import type { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createPaymentProvider, type PaymentProvider } from "@ovozai/integrations";

export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");

export const paymentProvider: Provider = {
  provide: PAYMENT_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService): PaymentProvider =>
    createPaymentProvider({
      provider: config.get<"mock" | "stripe">("PAYMENT_PROVIDER") ?? "mock",
      apiKey: config.get<string>("PAYMENT_API_KEY"),
    }),
};
