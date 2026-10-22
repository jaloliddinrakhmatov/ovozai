import { z } from "zod";

/**
 * Compliance & data-protection contracts (Phase 7, docs/COMPLIANCE.md).
 * Backs the right-to-erasure and data-retention surfaces under Law No. ZRU-547.
 */

/** Per-organization data-retention policy. null = retain indefinitely (no purge). */
export const retentionPolicySchema = z.object({
  recordingRetentionDays: z.number().int().positive().max(3650).nullable(),
  transcriptRetentionDays: z.number().int().positive().max(3650).nullable(),
});
export type RetentionPolicy = z.infer<typeof retentionPolicySchema>;

/** Update the retention policy. Either field may be omitted (left unchanged) or
 *  set to null (retain indefinitely). */
export const updateRetentionPolicyRequestSchema = z
  .object({
    recordingRetentionDays: z.number().int().positive().max(3650).nullable().optional(),
    transcriptRetentionDays: z.number().int().positive().max(3650).nullable().optional(),
  })
  .refine((v) => v.recordingRetentionDays !== undefined || v.transcriptRetentionDays !== undefined, {
    message: "At least one retention field must be provided",
  });
export type UpdateRetentionPolicyRequest = z.infer<typeof updateRetentionPolicyRequestSchema>;

/** Right-to-erasure: erase one customer's personal data (GDPR-style / ZRU-547). */
export const erasureRequestSchema = z.object({
  customerId: z.uuid(),
  reason: z.string().max(500).optional(),
});
export type ErasureRequest = z.infer<typeof erasureRequestSchema>;

/** What an erasure removed/anonymized — returned to the caller and audited. */
export const erasureResultSchema = z.object({
  customerId: z.string(),
  anonymizedCustomer: z.boolean(),
  redactedCalls: z.number().int().nonnegative(),
  deletedTranscripts: z.number().int().nonnegative(),
  deletedTranscriptTurns: z.number().int().nonnegative(),
  deletedRecordings: z.number().int().nonnegative(),
});
export type ErasureResult = z.infer<typeof erasureResultSchema>;

/** Live RLS self-check (defense-in-depth status) exercised through the enforced
 *  connection. `rlsEnforced` is false in dev when DATABASE_APP_URL is unset (the
 *  owner connection bypasses RLS and the app-layer guard is primary). */
export const rlsStatusSchema = z.object({
  rlsEnforced: z.boolean(),
  selfOrgVisibleCustomers: z.number().int().nonnegative(),
  foreignOrgVisibleCustomers: z.number().int().nonnegative(),
});
export type RlsStatus = z.infer<typeof rlsStatusSchema>;

/** Outcome of a retention sweep for one organization. */
export const retentionSweepResultSchema = z.object({
  organizationId: z.string(),
  recordingCutoff: z.iso.datetime().nullable(),
  transcriptCutoff: z.iso.datetime().nullable(),
  deletedRecordings: z.number().int().nonnegative(),
  deletedTranscripts: z.number().int().nonnegative(),
  deletedTranscriptTurns: z.number().int().nonnegative(),
});
export type RetentionSweepResult = z.infer<typeof retentionSweepResultSchema>;
