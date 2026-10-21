import { z } from "zod";
import { paginationQuerySchema } from "./pagination";

export const notificationChannelSchema = z.enum(["EMAIL", "SMS", "IN_APP"]);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

export const notificationStatusSchema = z.enum(["PENDING", "SENT", "FAILED"]);
export type NotificationStatus = z.infer<typeof notificationStatusSchema>;

export const notificationDtoSchema = z.object({
  id: z.uuid(),
  channel: notificationChannelSchema,
  status: notificationStatusSchema,
  event: z.string(),
  recipient: z.string().nullable(),
  subject: z.string().nullable(),
  body: z.string(),
  sentAt: z.string().nullable(),
  createdAt: z.string(),
});
export type NotificationDto = z.infer<typeof notificationDtoSchema>;

export const notificationListQuerySchema = paginationQuerySchema.extend({
  event: z.string().min(1).max(100).optional(),
  status: notificationStatusSchema.optional(),
});
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
