import { z } from "zod";
import { paginationQuerySchema } from "./pagination";

/** Event types a tenant can subscribe a webhook endpoint to (docs/API.md §13). */
export const WEBHOOK_EVENT_TYPES = [
  "call.completed",
  "call.transferred",
  "transcript.ready",
  "appointment.created",
] as const;
export const webhookEventTypeSchema = z.enum(WEBHOOK_EVENT_TYPES);
export type WebhookEventType = z.infer<typeof webhookEventTypeSchema>;

export const webhookStatusSchema = z.enum(["ACTIVE", "DISABLED"]);
export type WebhookStatus = z.infer<typeof webhookStatusSchema>;

export const webhookDeliveryStatusSchema = z.enum(["PENDING", "SUCCEEDED", "FAILED"]);
export type WebhookDeliveryStatus = z.infer<typeof webhookDeliveryStatusSchema>;

export const webhookEndpointDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  url: z.string(),
  events: z.array(z.string()),
  status: webhookStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WebhookEndpointDto = z.infer<typeof webhookEndpointDtoSchema>;

/** Returned once at creation: `secret` is shown a single time (sign deliveries). */
export const webhookEndpointCreatedDtoSchema = webhookEndpointDtoSchema.extend({
  secret: z.string(),
});
export type WebhookEndpointCreatedDto = z.infer<typeof webhookEndpointCreatedDtoSchema>;

export const createWebhookEndpointRequestSchema = z.object({
  url: z.url(),
  events: z.array(webhookEventTypeSchema).min(1),
});
export type CreateWebhookEndpointRequest = z.infer<typeof createWebhookEndpointRequestSchema>;

export const updateWebhookEndpointRequestSchema = z
  .object({
    url: z.url().optional(),
    events: z.array(webhookEventTypeSchema).min(1).optional(),
    status: webhookStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field must be provided" });
export type UpdateWebhookEndpointRequest = z.infer<typeof updateWebhookEndpointRequestSchema>;

export const webhookDeliveryDtoSchema = z.object({
  id: z.uuid(),
  endpointId: z.uuid(),
  event: z.string(),
  status: webhookDeliveryStatusSchema,
  attempts: z.number().int(),
  responseStatus: z.number().int().nullable(),
  lastAttemptAt: z.string().nullable(),
  createdAt: z.string(),
});
export type WebhookDeliveryDto = z.infer<typeof webhookDeliveryDtoSchema>;

export const webhookDeliveryListQuerySchema = paginationQuerySchema.extend({
  endpointId: z.uuid().optional(),
  status: webhookDeliveryStatusSchema.optional(),
});
export type WebhookDeliveryListQuery = z.infer<typeof webhookDeliveryListQuerySchema>;
