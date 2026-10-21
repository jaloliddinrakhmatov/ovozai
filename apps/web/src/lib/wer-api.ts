import {
  API_ROUTES,
  werSummaryResponseSchema,
  type WerSummaryResponse,
} from "@ovozai/contracts";
import { apiFetch } from "./api-client";

/** `GET /wer/summary` — average WER by provider × language (VIEWER+). */
export async function getWerSummary(): Promise<WerSummaryResponse> {
  const data = await apiFetch(API_ROUTES.wer.summary);
  return werSummaryResponseSchema.parse(data);
}
