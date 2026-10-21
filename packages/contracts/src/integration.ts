import { z } from "zod";

export const integrationTypeSchema = z.enum(["CALENDAR", "CRM", "PAYMENTS", "TELEPHONY"]);
export type IntegrationType = z.infer<typeof integrationTypeSchema>;

export const integrationStatusSchema = z.enum(["CONNECTED", "DISCONNECTED", "ERROR"]);
export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;

export const integrationDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  type: integrationTypeSchema,
  provider: z.string(),
  status: integrationStatusSchema,
  config: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type IntegrationDto = z.infer<typeof integrationDtoSchema>;

/** Connect an integration. `apiKey`, if given, is held as a secret reference and */
/** never returned; `config` holds non-secret settings. */
export const createIntegrationRequestSchema = z.object({
  type: integrationTypeSchema,
  provider: z.string().min(1).max(100),
  config: z.record(z.string(), z.unknown()).optional(),
  apiKey: z.string().min(1).max(500).optional(),
});
export type CreateIntegrationRequest = z.infer<typeof createIntegrationRequestSchema>;
