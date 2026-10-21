import { createHmac } from "node:crypto";
import {
  HEADERS,
  INTERNAL_ROUTES,
  type BookAppointmentToolRequest,
  type BookAppointmentToolResponse,
  type CallEventReport,
  type CallUpdateReport,
  type InternalCreateCallRequest,
  type InternalCreateCallResponse,
  type KnowledgeRetrievalToolRequest,
  type KnowledgeRetrievalToolResponse,
  type TranscriptTurnReport,
  type UsageReport,
} from "@ovozai/contracts";

/** The internal-channel operations the call session depends on (mockable in tests). */
export interface VoiceInternalClient {
  createCall(req: InternalCreateCallRequest): Promise<InternalCreateCallResponse>;
  appendEvent(callId: string, req: CallEventReport): Promise<{ id: string }>;
  appendTranscriptTurn(callId: string, req: TranscriptTurnReport): Promise<{ id: string }>;
  updateCall(callId: string, req: CallUpdateReport): Promise<unknown>;
  reportUsage(callId: string, req: UsageReport): Promise<{ id: string }>;
  knowledgeRetrieval(
    callId: string,
    req: KnowledgeRetrievalToolRequest,
  ): Promise<KnowledgeRetrievalToolResponse>;
  bookAppointment(
    callId: string,
    req: BookAppointmentToolRequest,
  ): Promise<BookAppointmentToolResponse>;
}

export interface InternalClientConfig {
  baseUrl: string;
  serviceToken: string;
  hmacSecret: string;
}

/**
 * HTTP client for the API's internal voice channel. Each request is signed with
 * the service token + an HMAC over `"<t>.<raw-body>"` (matching InternalAuthGuard).
 */
export class InternalApiClient implements VoiceInternalClient {
  constructor(private readonly config: InternalClientConfig) {}

  private async send<T>(method: "POST" | "PATCH", path: string, body: unknown): Promise<T> {
    const raw = JSON.stringify(body ?? {});
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", this.config.hmacSecret).update(`${t}.${raw}`).digest("hex");
    const response = await fetch(`${this.config.baseUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        [HEADERS.serviceToken]: this.config.serviceToken,
        [HEADERS.signature]: `t=${t},v1=${v1}`,
      },
      body: raw,
    });
    if (!response.ok) {
      throw new Error(`internal ${method} ${path} -> ${response.status}: ${await response.text()}`);
    }
    return (await response.json()) as T;
  }

  createCall(req: InternalCreateCallRequest): Promise<InternalCreateCallResponse> {
    return this.send("POST", INTERNAL_ROUTES.createCall, req);
  }
  appendEvent(callId: string, req: CallEventReport): Promise<{ id: string }> {
    return this.send("POST", INTERNAL_ROUTES.events(callId), req);
  }
  appendTranscriptTurn(callId: string, req: TranscriptTurnReport): Promise<{ id: string }> {
    return this.send("POST", INTERNAL_ROUTES.transcript(callId), req);
  }
  updateCall(callId: string, req: CallUpdateReport): Promise<unknown> {
    return this.send("PATCH", INTERNAL_ROUTES.update(callId), req);
  }
  reportUsage(callId: string, req: UsageReport): Promise<{ id: string }> {
    return this.send("POST", INTERNAL_ROUTES.usage(callId), req);
  }
  knowledgeRetrieval(
    callId: string,
    req: KnowledgeRetrievalToolRequest,
  ): Promise<KnowledgeRetrievalToolResponse> {
    return this.send("POST", INTERNAL_ROUTES.toolKnowledgeRetrieval(callId), req);
  }
  bookAppointment(
    callId: string,
    req: BookAppointmentToolRequest,
  ): Promise<BookAppointmentToolResponse> {
    return this.send("POST", INTERNAL_ROUTES.toolBookAppointment(callId), req);
  }
}
