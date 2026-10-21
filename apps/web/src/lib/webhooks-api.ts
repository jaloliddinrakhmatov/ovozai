import {
  API_ROUTES,
  createWebhookEndpointRequestSchema,
  paginated,
  updateWebhookEndpointRequestSchema,
  webhookDeliveryDtoSchema,
  webhookEndpointCreatedDtoSchema,
  webhookEndpointDtoSchema,
  type CreateWebhookEndpointRequest,
  type UpdateWebhookEndpointRequest,
  type WebhookDeliveryDto,
  type WebhookDeliveryStatus,
  type WebhookEndpointCreatedDto,
  type WebhookEndpointDto,
} from "@ovozai/contracts";
import { apiFetch } from "./api-client";
import type { PaginatedResult } from "./auth-api";

const webhookEndpointListSchema = paginated(webhookEndpointDtoSchema);
const webhookDeliveryListSchema = paginated(webhookDeliveryDtoSchema);

/** `GET /webhooks/endpoints` — list configured endpoints (ADMIN+). */
export async function listWebhookEndpoints(params?: {
  limit?: number;
  cursor?: string;
}): Promise<PaginatedResult<WebhookEndpointDto>> {
  const search = new URLSearchParams();
  if (params?.limit !== undefined) search.set("limit", String(params.limit));
  if (params?.cursor) search.set("cursor", params.cursor);
  const query = search.toString();
  const path = query
    ? `${API_ROUTES.webhooks.endpoints}?${query}`
    : API_ROUTES.webhooks.endpoints;
  const data = await apiFetch(path);
  return webhookEndpointListSchema.parse(data);
}

/**
 * `POST /webhooks/endpoints` — register an endpoint (ADMIN+).
 *
 * The signing `secret` is returned a single time in the creation response and
 * never again, so callers must surface it immediately.
 */
export async function createWebhookEndpoint(
  input: CreateWebhookEndpointRequest,
): Promise<WebhookEndpointCreatedDto> {
  const body = createWebhookEndpointRequestSchema.parse(input);
  const data = await apiFetch(API_ROUTES.webhooks.endpoints, { method: "POST", body });
  return webhookEndpointCreatedDtoSchema.parse(data);
}

/** `PATCH /webhooks/endpoints/:id` — update url, events, or status (ADMIN+). */
export async function updateWebhookEndpoint(
  id: string,
  input: UpdateWebhookEndpointRequest,
): Promise<WebhookEndpointDto> {
  const body = updateWebhookEndpointRequestSchema.parse(input);
  const data = await apiFetch(API_ROUTES.webhooks.endpointById(id), { method: "PATCH", body });
  return webhookEndpointDtoSchema.parse(data);
}

/** `DELETE /webhooks/endpoints/:id` — remove an endpoint (ADMIN+). */
export async function deleteWebhookEndpoint(id: string): Promise<void> {
  await apiFetch(API_ROUTES.webhooks.endpointById(id), { method: "DELETE" });
}

/** Filters accepted by {@link listWebhookDeliveries}; mirror `webhookDeliveryListQuerySchema`. */
export interface ListWebhookDeliveriesParams {
  limit?: number;
  cursor?: string;
  endpointId?: string;
  status?: WebhookDeliveryStatus;
}

/** `GET /webhooks/deliveries` — recent delivery attempts, newest first (ADMIN+). */
export async function listWebhookDeliveries(
  params?: ListWebhookDeliveriesParams,
): Promise<PaginatedResult<WebhookDeliveryDto>> {
  const search = new URLSearchParams();
  if (params?.limit !== undefined) search.set("limit", String(params.limit));
  if (params?.cursor) search.set("cursor", params.cursor);
  if (params?.endpointId) search.set("endpointId", params.endpointId);
  if (params?.status) search.set("status", params.status);
  const query = search.toString();
  const path = query
    ? `${API_ROUTES.webhooks.deliveries}?${query}`
    : API_ROUTES.webhooks.deliveries;
  const data = await apiFetch(path);
  return webhookDeliveryListSchema.parse(data);
}
