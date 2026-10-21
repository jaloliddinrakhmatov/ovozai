import { z } from "zod";
import { paginationQuerySchema } from "./pagination";

/** E.164 phone number (e.g. +998901234567). */
export const phoneE164Schema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, "Must be a valid E.164 phone number, e.g. +998901234567");

export const customerDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  phoneE164: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  locale: z.string(),
  notes: z.string().nullable(),
  tags: z.array(z.string()),
  lastContactedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CustomerDto = z.infer<typeof customerDtoSchema>;

export const createCustomerRequestSchema = z.object({
  phoneE164: phoneE164Schema,
  name: z.string().min(1).max(200).optional(),
  email: z.email().optional(),
  locale: z.string().min(2).max(35).optional(),
  notes: z.string().max(5000).optional(),
  tags: z.array(z.string().min(1).max(50)).max(50).optional(),
});
export type CreateCustomerRequest = z.infer<typeof createCustomerRequestSchema>;

export const updateCustomerRequestSchema = z
  .object({
    phoneE164: phoneE164Schema.optional(),
    name: z.string().min(1).max(200).nullable().optional(),
    email: z.email().nullable().optional(),
    locale: z.string().min(2).max(35).optional(),
    notes: z.string().max(5000).nullable().optional(),
    tags: z.array(z.string().min(1).max(50)).max(50).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateCustomerRequest = z.infer<typeof updateCustomerRequestSchema>;

/** List/search customers: pagination + optional free-text / phone filters. */
export const customerListQuerySchema = paginationQuerySchema.extend({
  q: z.string().min(1).max(200).optional(),
  phoneE164: z.string().min(1).max(20).optional(),
});
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
