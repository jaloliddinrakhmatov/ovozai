import { z } from "zod";
import { languageSchema } from "./agent";
import { paginationQuerySchema } from "./pagination";

export const callDirectionSchema = z.enum(["INBOUND", "OUTBOUND"]);
export type CallDirection = z.infer<typeof callDirectionSchema>;

export const callStatusSchema = z.enum([
  "QUEUED",
  "RINGING",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
  "NO_ANSWER",
  "BUSY",
  "CANCELED",
  "TRANSFERRED",
]);
export type CallStatus = z.infer<typeof callStatusSchema>;

export const transcriptRoleSchema = z.enum(["CALLER", "AGENT", "SYSTEM", "TOOL"]);
export type TranscriptRole = z.infer<typeof transcriptRoleSchema>;

export const usageMetricSchema = z.enum(["CALL_MINUTES", "STT_SECONDS", "TTS_CHARS", "LLM_TOKENS"]);
export type UsageMetric = z.infer<typeof usageMetricSchema>;

export const callDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  agentId: z.uuid().nullable(),
  customerId: z.uuid().nullable(),
  direction: callDirectionSchema,
  status: callStatusSchema,
  fromE164: z.string().nullable(),
  toE164: z.string().nullable(),
  language: languageSchema,
  startedAt: z.string(),
  answeredAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  durationSec: z.number().int().nullable(),
  endedReason: z.string().nullable(),
  recordingObjectKey: z.string().nullable(),
  recordingConsent: z.boolean(),
  costCents: z.number().int().nullable(),
  phoneNumberId: z.uuid().nullable(),
  transferredTo: z.string().nullable(),
  externalRef: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CallDto = z.infer<typeof callDtoSchema>;

export const callEventDtoSchema = z.object({
  id: z.uuid(),
  callId: z.uuid(),
  type: z.string(),
  payload: z.unknown().nullable(),
  occurredAt: z.string(),
});
export type CallEventDto = z.infer<typeof callEventDtoSchema>;

export const transcriptTurnDtoSchema = z.object({
  id: z.uuid(),
  role: transcriptRoleSchema,
  text: z.string(),
  startMs: z.number().int(),
  endMs: z.number().int().nullable(),
  confidence: z.number().nullable(),
  language: languageSchema.nullable(),
});
export type TranscriptTurnDto = z.infer<typeof transcriptTurnDtoSchema>;

export const transcriptDtoSchema = z.object({
  id: z.uuid(),
  callId: z.uuid(),
  language: languageSchema,
  fullText: z.string().nullable(),
  turns: z.array(transcriptTurnDtoSchema),
});
export type TranscriptDto = z.infer<typeof transcriptDtoSchema>;

export const callListQuerySchema = paginationQuerySchema.extend({
  status: callStatusSchema.optional(),
  direction: callDirectionSchema.optional(),
  agentId: z.uuid().optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});
export type CallListQuery = z.infer<typeof callListQuerySchema>;

export const recordingUrlResponseSchema = z.object({
  url: z.string().nullable(),
  expiresAt: z.string().nullable(),
});
export type RecordingUrlResponse = z.infer<typeof recordingUrlResponseSchema>;
