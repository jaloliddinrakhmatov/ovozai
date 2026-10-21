import { z } from "zod";

/** Lifecycle state of an API key (mirrors the DB enum). */
export const apiKeyStatusSchema = z.enum(["ACTIVE", "REVOKED", "EXPIRED"]);
export type ApiKeyStatus = z.infer<typeof apiKeyStatusSchema>;

/**
 * Public representation of an API key. Never includes the secret — only the
 * `prefix` (for identification) and metadata.
 */
export const apiKeyDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(z.string()),
  status: apiKeyStatusSchema,
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
});
export type ApiKeyDto = z.infer<typeof apiKeyDtoSchema>;

/**
 * API key as returned once at creation. `key` is the full secret
 * (`ovz_live_<prefix>.<secret>`), shown a single time; only its hash is stored.
 */
export const apiKeyCreatedDtoSchema = apiKeyDtoSchema.extend({
  key: z.string(),
});
export type ApiKeyCreatedDto = z.infer<typeof apiKeyCreatedDtoSchema>;

export const createApiKeyRequestSchema = z.object({
  name: z.string().min(1).max(200),
  scopes: z.array(z.string().min(1)).max(50).optional(),
  expiresAt: z.iso.datetime().optional(),
});
export type CreateApiKeyRequest = z.infer<typeof createApiKeyRequestSchema>;
