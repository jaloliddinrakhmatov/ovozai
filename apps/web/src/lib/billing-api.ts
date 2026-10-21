import {
  API_ROUTES,
  createSubscriptionRequestSchema,
  planDtoSchema,
  subscriptionDtoSchema,
  usageSummaryResponseSchema,
  type CreateSubscriptionRequest,
  type PlanDto,
  type SubscriptionDto,
  type UsageSummaryResponse,
} from "@ovozai/contracts";
import { apiFetch } from "./api-client";

const planListSchema = planDtoSchema.array();
const subscriptionOrNullSchema = subscriptionDtoSchema.nullable();

/** `GET /billing/plans` — available plans as a bare array, not an envelope (VIEWER+). */
export async function listPlans(): Promise<PlanDto[]> {
  const data = await apiFetch(API_ROUTES.billing.plans);
  return planListSchema.parse(data);
}

/**
 * `GET /billing/subscription` — the active subscription, or `null` (ADMIN+).
 *
 * When the organization has no active subscription the endpoint responds `200`
 * with a JSON `null` body, so this resolves to `null` rather than throwing.
 */
export async function getSubscription(): Promise<SubscriptionDto | null> {
  const data = await apiFetch(API_ROUTES.billing.subscription);
  return subscriptionOrNullSchema.parse(data ?? null);
}

/** `POST /billing/subscription` — subscribe or change plan (OWNER). */
export async function createSubscription(
  input: CreateSubscriptionRequest,
): Promise<SubscriptionDto> {
  const body = createSubscriptionRequestSchema.parse(input);
  const data = await apiFetch(API_ROUTES.billing.subscription, { method: "POST", body });
  return subscriptionDtoSchema.parse(data);
}

/** `GET /billing/usage` — current-period usage rolled up by metric (ADMIN+). */
export async function getUsage(): Promise<UsageSummaryResponse> {
  const data = await apiFetch(API_ROUTES.billing.usage);
  return usageSummaryResponseSchema.parse(data);
}
