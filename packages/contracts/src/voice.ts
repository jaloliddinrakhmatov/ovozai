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

/** POST /internal/v1/calls — create a call and load its agent config. The agent
 * is selected directly by `agentId` (dev dispatch) or resolved from the dialed
 * number `toE164` → PhoneNumber → Agent (Phase 5 inbound routing). */
export const internalCreateCallRequestSchema = z
  .object({
    agentId: z.uuid().optional(),
    direction: callDirectionSchema.default("INBOUND"),
    fromE164: z.string().max(32).optional(),
    toE164: z.string().max(32).optional(),
    externalRef: z.string().max(200).optional(),
    language: languageSchema.optional(),
  })
  .refine((v) => Boolean(v.agentId) || Boolean(v.toE164), {
    message: "agentId or toE164 is required to route the call",
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
    recordingConsent: z.boolean().optional(),
    transferredTo: z.string().max(32).optional(),
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

/** Why a requested slot could not be booked (so the agent can offer alternatives). */
export const slotUnavailableReasonSchema = z.enum(["past", "out_of_hours", "conflict"]);
export type SlotUnavailableReason = z.infer<typeof slotUnavailableReasonSchema>;

export const bookAppointmentToolRequestSchema = z.object({
  title: z.string().min(1).max(200),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().optional(),
  /** Appointment length; used to derive `endsAt` and to detect conflicts. */
  durationMinutes: z.coerce.number().int().min(5).max(480).optional(),
  customerName: z.string().max(200).optional(),
  phone: z.string().max(32).optional(),
  notes: z.string().max(5000).optional(),
});
export type BookAppointmentToolRequest = z.infer<typeof bookAppointmentToolRequestSchema>;

export const bookAppointmentToolResponseSchema = z.object({
  /** True only when the appointment was actually created. */
  booked: z.boolean(),
  appointmentId: z.uuid().optional(),
  customerId: z.uuid().optional(),
  status: z.string().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  /** Human-friendly start time in the agent's timezone, for the agent to speak. */
  startsAtText: z.string().optional(),
  /** Set when `booked` is false. */
  reason: slotUnavailableReasonSchema.optional(),
  /** ISO alternatives when the requested slot was unavailable. */
  suggestions: z.array(z.string()).optional(),
  /** Human-friendly alternatives in the agent's timezone, for the agent to speak. */
  suggestionsText: z.array(z.string()).optional(),
});
export type BookAppointmentToolResponse = z.infer<typeof bookAppointmentToolResponseSchema>;

/** `check_availability` tool — is a slot bookable, and if not, the nearest openings. */
export const checkAvailabilityToolRequestSchema = z.object({
  startsAt: z.iso.datetime(),
  durationMinutes: z.coerce.number().int().min(5).max(480).optional(),
});
export type CheckAvailabilityToolRequest = z.infer<typeof checkAvailabilityToolRequestSchema>;

export const checkAvailabilityToolResponseSchema = z.object({
  available: z.boolean(),
  reason: slotUnavailableReasonSchema.optional(),
  requestedStartsAt: z.string(),
  requestedStartsAtText: z.string(),
  suggestions: z.array(z.string()),
  suggestionsText: z.array(z.string()),
});
export type CheckAvailabilityToolResponse = z.infer<typeof checkAvailabilityToolResponseSchema>;

/** `reschedule_appointment` tool — move the caller's upcoming appointment. */
export const rescheduleAppointmentToolRequestSchema = z.object({
  newStartsAt: z.iso.datetime(),
  newEndsAt: z.iso.datetime().optional(),
  durationMinutes: z.coerce.number().int().min(5).max(480).optional(),
  /** Which appointment to move; defaults to the caller's soonest upcoming one. */
  appointmentId: z.uuid().optional(),
});
export type RescheduleAppointmentToolRequest = z.infer<typeof rescheduleAppointmentToolRequestSchema>;

export const rescheduleAppointmentToolResponseSchema = z.object({
  rescheduled: z.boolean(),
  appointmentId: z.string().optional(),
  startsAt: z.string().optional(),
  startsAtText: z.string().optional(),
  status: z.string().optional(),
  reason: z.enum(["past", "out_of_hours", "conflict", "not_found"]).optional(),
  suggestions: z.array(z.string()).optional(),
  suggestionsText: z.array(z.string()).optional(),
});
export type RescheduleAppointmentToolResponse = z.infer<typeof rescheduleAppointmentToolResponseSchema>;

/** `cancel_appointment` tool — cancel the caller's upcoming appointment. */
export const cancelAppointmentToolRequestSchema = z.object({
  appointmentId: z.uuid().optional(),
  reason: z.string().max(500).optional(),
});
export type CancelAppointmentToolRequest = z.infer<typeof cancelAppointmentToolRequestSchema>;

export const cancelAppointmentToolResponseSchema = z.object({
  canceled: z.boolean(),
  appointmentId: z.string().optional(),
  startsAt: z.string().optional(),
  startsAtText: z.string().optional(),
  reason: z.enum(["not_found"]).optional(),
});
export type CancelAppointmentToolResponse = z.infer<typeof cancelAppointmentToolResponseSchema>;

/** `transfer_call` tool — warm/cold handoff to a human (Phase 5). */
export const transferCallToolRequestSchema = z.object({
  target: z.string().min(3).max(32),
  mode: z.enum(["warm", "cold"]).default("cold"),
  reason: z.string().max(500).optional(),
});
export type TransferCallToolRequest = z.infer<typeof transferCallToolRequestSchema>;

export const transferCallToolResponseSchema = z.object({
  status: z.string(),
  target: z.string(),
  mode: z.string(),
});
export type TransferCallToolResponse = z.infer<typeof transferCallToolResponseSchema>;
