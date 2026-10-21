import {
  API_ROUTES,
  callDtoSchema,
  callEventDtoSchema,
  paginated,
  recordingUrlResponseSchema,
  transcriptDtoSchema,
  type CallDirection,
  type CallDto,
  type CallEventDto,
  type CallStatus,
  type RecordingUrlResponse,
  type TranscriptDto,
} from "@ovozai/contracts";
import { ApiError, apiFetch } from "./api-client";
import type { PaginatedResult } from "./auth-api";

const callListSchema = paginated(callDtoSchema);
const callEventListSchema = paginated(callEventDtoSchema);

/** Filters accepted by {@link listCalls}; mirror the `callListQuerySchema` query. */
export interface ListCallsParams {
  limit?: number;
  cursor?: string;
  status?: CallStatus;
  direction?: CallDirection;
  agentId?: string;
  /** ISO timestamp lower bound (inclusive) on `startedAt`. */
  from?: string;
  /** ISO timestamp upper bound (inclusive) on `startedAt`. */
  to?: string;
}

/** `GET /calls` — list the active org's call history, newest first (VIEWER+). */
export async function listCalls(params?: ListCallsParams): Promise<PaginatedResult<CallDto>> {
  const search = new URLSearchParams();
  if (params?.limit !== undefined) search.set("limit", String(params.limit));
  if (params?.cursor) search.set("cursor", params.cursor);
  if (params?.status) search.set("status", params.status);
  if (params?.direction) search.set("direction", params.direction);
  if (params?.agentId) search.set("agentId", params.agentId);
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  const query = search.toString();
  const path = query ? `${API_ROUTES.calls.root}?${query}` : API_ROUTES.calls.root;
  const data = await apiFetch(path);
  return callListSchema.parse(data);
}

/** `GET /calls/:id` — fetch a single call (VIEWER+). */
export async function getCall(id: string): Promise<CallDto> {
  const data = await apiFetch(API_ROUTES.calls.byId(id));
  return callDtoSchema.parse(data);
}

/** `GET /calls/:id/events` — lifecycle events for a call, time-ordered (VIEWER+). */
export async function listCallEvents(
  callId: string,
  params?: { limit?: number; cursor?: string },
): Promise<PaginatedResult<CallEventDto>> {
  const search = new URLSearchParams();
  if (params?.limit !== undefined) search.set("limit", String(params.limit));
  if (params?.cursor) search.set("cursor", params.cursor);
  const query = search.toString();
  const base = API_ROUTES.calls.events(callId);
  const path = query ? `${base}?${query}` : base;
  const data = await apiFetch(path);
  return callEventListSchema.parse(data);
}

/**
 * `GET /calls/:id/transcript` — the call transcript (VIEWER+).
 *
 * A transcript may not exist yet (e.g. the call is still in progress or was
 * never answered), in which case the API responds `404`. That is a normal,
 * expected condition rather than an error, so it is surfaced as `null` instead
 * of a thrown {@link ApiError}; any other failure still throws.
 */
export async function getCallTranscript(callId: string): Promise<TranscriptDto | null> {
  try {
    const data = await apiFetch(API_ROUTES.calls.transcript(callId));
    return transcriptDtoSchema.parse(data);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * `GET /calls/:id/recording` — a short-lived recording URL (ADMIN+).
 *
 * In Phase 4 there is no call storage yet, so `url` is always `null`; callers
 * should render a "recording not available" state in that case.
 */
export async function getCallRecording(callId: string): Promise<RecordingUrlResponse> {
  const data = await apiFetch(API_ROUTES.calls.recording(callId));
  return recordingUrlResponseSchema.parse(data);
}
