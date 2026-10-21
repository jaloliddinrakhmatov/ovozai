import { z } from "zod";
import { agentConfigSchema, languageSchema } from "./agent";
import { callDirectionSchema, callStatusSchema, transcriptRoleSchema, usageMetricSchema } from "./call";
import { retrievalResultSchema } from "./knowledge";

/**
 * Internal voice-worker ↔ API channel (docs/API.md §12, docs/VOICE_PIPELINE.md).
 * These requests are authenticated with a service token + HMAC signature, not a
 * user JWT; the organization is derived from the referenced Call, never trusted
 * from the payload.
 */

/** Agent configuration the voice-worker loads at call start. */
export const voiceAgentConfigSchema = z.object({
  agentId: z.uuid(),
  name: z.string(),
  defaultLanguage: languageSchema,
  languages: z.array(languageSchema),
  systemPrompt: z.string(),
  greeting: z.string(),
  /** Localized recording-consent announcement played with the greeting. */
  consentAnnouncement: z.string().nullable(),
  voiceId: z.string().nullable(),
  transferNumber: z.string().nullable(),
  config: agentConfigSchema.nullable(),
});
export type VoiceAgentConfig = z.infer<typeof voiceAgentConfigSchema>;

/** POST /internal/v1/calls — create a call and load its agent config. */
export const internalCreateCallRequestSchema = z.object({
  // Phase 4 dev dispatch selects the agent directly; Phase 5 resolves toE164 →
  // PhoneNumber → Agent.
  agentId: z.uuid(),
  direction: callDirectionSchema.default("INBOUND"),
  fromE164: z.string().max(32).optional(),
  toE164: z.string().max(32).optional(),
  externalRef: z.string().max(200).optional(),
  language: languageSchema.optional(),
});
export type InternalCreateCallRequest = z.infer<typeof internalCreateCallRequestSchema>;

export const internalCreateCallResponseSchema = z.object({
  callId: z.uuid(),
  organizationId: z.uuid(),
  agent: voiceAgentConfigSchema,
});
export type InternalCreateCallResponse = z.infer<typeof internalCreateCallResponseSchema>;

/** Append a lifecycle event. `eventId` makes reporting idempotent. */
export const callEventReportSchema = z.object({
  eventId: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
  payload: z.record(z.string(), z.unknown()).optional(),
  occurredAt: z.iso.datetime().optional(),
});
export type CallEventReport = z.infer<typeof callEventReportSchema>;

/** Append a final transcript turn. `turnId` makes reporting idempotent. */
export const transcriptTurnReportSchema = z.object({
  turnId: z.string().min(1).max(200),
  role: transcriptRoleSchema,
  text: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative().optional(),
  confidence: z.number().min(0).max(1).optional(),
  language: languageSchema.optional(),
});
export type TranscriptTurnReport = z.infer<typeof transcriptTurnReportSchema>;

/** PATCH /internal/v1/calls/:id — update status/timing/recording/cost. */
export const callUpdateReportSchema = z
  .object({
    status: callStatusSchema.optional(),
    answeredAt: z.iso.datetime().optional(),
    endedAt: z.iso.datetime().optional(),
    durationSec: z.number().int().nonnegative().optional(),
    endedReason: z.string().max(200).optional(),
    recordingObjectKey: z.string().max(500).optional(),
    costCents: z.number().int().nonnegative().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field must be provided" });
export type CallUpdateReport = z.infer<typeof callUpdateReportSchema>;

/** Report a usage record for the call. */
export const usageReportSchema = z.object({
  metric: usageMetricSchema,
  quantity: z.number().nonnegative(),
  occurredAt: z.iso.datetime().optional(),
  periodKey: z.string().max(20).optional(),
});
export type UsageReport = z.infer<typeof usageReportSchema>;

// --- Internal tool execution (org-scoped, derived from the Call) ---

export const knowledgeRetrievalToolRequestSchema = z.object({
  query: z.string().min(1).max(2000),
  topK: z.coerce.number().int().min(1).max(20).default(5),
  language: languageSchema.optional(),
});
export type KnowledgeRetrievalToolRequest = z.infer<typeof knowledgeRetrievalToolRequestSchema>;

export const knowledgeRetrievalToolResponseSchema = z.object({
  results: z.array(retrievalResultSchema),
});
export type KnowledgeRetrievalToolResponse = z.infer<typeof knowledgeRetrievalToolResponseSchema>;

export const bookAppointmentToolRequestSchema = z.object({
  title: z.string().min(1).max(200),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().optional(),
  customerName: z.string().max(200).optional(),
  phone: z.string().max(32).optional(),
  notes: z.string().max(5000).optional(),
});
export type BookAppointmentToolRequest = z.infer<typeof bookAppointmentToolRequestSchema>;

export const bookAppointmentToolResponseSchema = z.object({
  appointmentId: z.uuid(),
  customerId: z.uuid(),
  status: z.string(),
  startsAt: z.string(),
});
export type BookAppointmentToolResponse = z.infer<typeof bookAppointmentToolResponseSchema>;
