import { z } from "zod";
import { usageMetricSchema } from "./call";

export const subscriptionStatusSchema = z.enum([
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "CANCELED",
  "INCOMPLETE",
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const planDtoSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  priceCents: z.number().int(),
  currency: z.string(),
  limits: z.record(z.string(), z.unknown()).nullable(),
  active: z.boolean(),
});
export type PlanDto = z.infer<typeof planDtoSchema>;

export const subscriptionDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  planId: z.uuid(),
  planCode: z.string(),
  status: subscriptionStatusSchema,
  currentPeriodStart: z.string(),
  currentPeriodEnd: z.string(),
  createdAt: z.string(),
});
export type SubscriptionDto = z.infer<typeof subscriptionDtoSchema>;

export const createSubscriptionRequestSchema = z.object({
  planCode: z.string().min(1).max(100),
});
export type CreateSubscriptionRequest = z.infer<typeof createSubscriptionRequestSchema>;

export const usageSummaryItemSchema = z.object({
  metric: usageMetricSchema,
  periodKey: z.string(),
  quantity: z.number(),
  rawCount: z.number().int(),
});
export type UsageSummaryItem = z.infer<typeof usageSummaryItemSchema>;

export const usageSummaryResponseSchema = z.object({
  periodKey: z.string(),
  items: z.array(usageSummaryItemSchema),
});
export type UsageSummaryResponse = z.infer<typeof usageSummaryResponseSchema>;
