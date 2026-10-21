import { z } from "zod";
import { phoneE164Schema } from "./customer";
import { paginationQuerySchema } from "./pagination";

export const phoneNumberStatusSchema = z.enum(["ACTIVE", "INACTIVE", "PORTING", "RELEASED"]);
export type PhoneNumberStatus = z.infer<typeof phoneNumberStatusSchema>;

export const phoneNumberDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  e164: z.string(),
  provider: z.string(),
  providerNumberId: z.string().nullable(),
  agentId: z.uuid().nullable(),
  status: phoneNumberStatusSchema,
  capabilities: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PhoneNumberDto = z.infer<typeof phoneNumberDtoSchema>;

export const createPhoneNumberRequestSchema = z.object({
  e164: phoneE164Schema,
  provider: z.string().min(1).max(100).default("mock"),
  agentId: z.uuid().optional(),
  capabilities: z.array(z.string().min(1)).max(20).optional(),
});
export type CreatePhoneNumberRequest = z.infer<typeof createPhoneNumberRequestSchema>;

export const updatePhoneNumberRequestSchema = z
  .object({
    agentId: z.uuid().nullable().optional(),
    status: phoneNumberStatusSchema.optional(),
    capabilities: z.array(z.string().min(1)).max(20).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field must be provided" });
export type UpdatePhoneNumberRequest = z.infer<typeof updatePhoneNumberRequestSchema>;

export const phoneNumberListQuerySchema = paginationQuerySchema.extend({
  status: phoneNumberStatusSchema.optional(),
});
export type PhoneNumberListQuery = z.infer<typeof phoneNumberListQuerySchema>;
