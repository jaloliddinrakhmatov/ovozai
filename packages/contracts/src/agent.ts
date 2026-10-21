import { z } from "zod";

/** Platform languages for agents, calls, and content (mirrors the DB enum). */
export const languageSchema = z.enum(["UZ", "RU", "EN"]);
export type Language = z.infer<typeof languageSchema>;

/** Lifecycle state of a configured AI agent. */
export const agentStatusSchema = z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]);
export type AgentStatus = z.infer<typeof agentStatusSchema>;

/** Free-form agent configuration (model params, tool toggles, business hours). */
export const agentConfigSchema = z.record(z.string(), z.unknown());
export type AgentConfig = z.infer<typeof agentConfigSchema>;

export const agentDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  name: z.string(),
  status: agentStatusSchema,
  defaultLanguage: languageSchema,
  systemPrompt: z.string().nullable(),
  voiceId: z.string().nullable(),
  greeting: z.string().nullable(),
  transferNumber: z.string().nullable(),
  config: agentConfigSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AgentDto = z.infer<typeof agentDtoSchema>;

export const agentVersionDtoSchema = z.object({
  id: z.uuid(),
  agentId: z.uuid(),
  version: z.number().int(),
  config: agentConfigSchema,
  publishedAt: z.string(),
});
export type AgentVersionDto = z.infer<typeof agentVersionDtoSchema>;

export const createAgentRequestSchema = z.object({
  name: z.string().min(1).max(200),
  defaultLanguage: languageSchema.default("UZ"),
  systemPrompt: z.string().max(10_000).optional(),
  voiceId: z.string().max(200).optional(),
  greeting: z.string().max(2000).optional(),
  transferNumber: z.string().max(32).optional(),
  config: agentConfigSchema.optional(),
});
export type CreateAgentRequest = z.infer<typeof createAgentRequestSchema>;

export const updateAgentRequestSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    status: agentStatusSchema.optional(),
    defaultLanguage: languageSchema.optional(),
    systemPrompt: z.string().max(10_000).nullable().optional(),
    voiceId: z.string().max(200).nullable().optional(),
    greeting: z.string().max(2000).nullable().optional(),
    transferNumber: z.string().max(32).nullable().optional(),
    config: agentConfigSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateAgentRequest = z.infer<typeof updateAgentRequestSchema>;
