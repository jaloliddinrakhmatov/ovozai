import { z } from "zod";
import { paginationQuerySchema } from "./pagination";

export const appointmentStatusSchema = z.enum([
  "PENDING",
  "CONFIRMED",
  "CANCELED",
  "COMPLETED",
  "NO_SHOW",
]);
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

export const appointmentDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  customerId: z.uuid(),
  agentId: z.uuid().nullable(),
  /** The call during which the AI booked this appointment, if any. */
  callId: z.uuid().nullable(),
  title: z.string(),
  notes: z.string().nullable(),
  startsAt: z.string(),
  endsAt: z.string().nullable(),
  status: appointmentStatusSchema,
  externalCalendarId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AppointmentDto = z.infer<typeof appointmentDtoSchema>;

export const createAppointmentRequestSchema = z.object({
  customerId: z.uuid(),
  agentId: z.uuid().optional(),
  title: z.string().min(1).max(200),
  notes: z.string().max(5000).optional(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().optional(),
});
export type CreateAppointmentRequest = z.infer<typeof createAppointmentRequestSchema>;

export const updateAppointmentRequestSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    notes: z.string().max(5000).nullable().optional(),
    startsAt: z.iso.datetime().optional(),
    endsAt: z.iso.datetime().nullable().optional(),
    status: appointmentStatusSchema.optional(),
    agentId: z.uuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateAppointmentRequest = z.infer<typeof updateAppointmentRequestSchema>;

export const appointmentListQuerySchema = paginationQuerySchema.extend({
  status: appointmentStatusSchema.optional(),
  customerId: z.uuid().optional(),
  callId: z.uuid().optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});
export type AppointmentListQuery = z.infer<typeof appointmentListQuerySchema>;
