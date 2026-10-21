import { z } from "zod";
import { languageSchema } from "./agent";

export const werMeasurementDtoSchema = z.object({
  id: z.uuid(),
  provider: z.string(),
  language: languageSchema,
  wer: z.number(),
  substitutions: z.number().int(),
  deletions: z.number().int(),
  insertions: z.number().int(),
  referenceWords: z.number().int(),
  callId: z.uuid().nullable(),
  createdAt: z.string(),
});
export type WerMeasurementDto = z.infer<typeof werMeasurementDtoSchema>;

/** Record a WER sample (internal): the API computes WER from reference vs hypothesis. */
export const recordWerRequestSchema = z.object({
  provider: z.string().min(1).max(100),
  language: languageSchema,
  reference: z.string().min(1),
  hypothesis: z.string(),
});
export type RecordWerRequest = z.infer<typeof recordWerRequestSchema>;

export const werSummaryItemSchema = z.object({
  provider: z.string(),
  language: languageSchema,
  sampleCount: z.number().int(),
  averageWer: z.number(),
});
export type WerSummaryItem = z.infer<typeof werSummaryItemSchema>;

export const werSummaryResponseSchema = z.object({
  items: z.array(werSummaryItemSchema),
});
export type WerSummaryResponse = z.infer<typeof werSummaryResponseSchema>;
