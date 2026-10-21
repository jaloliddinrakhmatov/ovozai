import { Body, Controller, Param, Patch, Post, UseGuards } from "@nestjs/common";
import {
  bookAppointmentToolRequestSchema,
  callEventReportSchema,
  callUpdateReportSchema,
  internalCreateCallRequestSchema,
  knowledgeRetrievalToolRequestSchema,
  recordWerRequestSchema,
  transcriptTurnReportSchema,
  transferCallToolRequestSchema,
  usageReportSchema,
  type BookAppointmentToolRequest,
  type BookAppointmentToolResponse,
  type CallDto,
  type CallEventReport,
  type CallUpdateReport,
  type InternalCreateCallRequest,
  type InternalCreateCallResponse,
  type KnowledgeRetrievalToolRequest,
  type KnowledgeRetrievalToolResponse,
  type RecordWerRequest,
  type TranscriptTurnReport,
  type TransferCallToolRequest,
  type TransferCallToolResponse,
  type UsageReport,
} from "@ovozai/contracts";
import { Public } from "../common/public.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { InternalAuthGuard } from "./internal-auth.guard";
import { InternalService } from "./internal.service";

/**
 * Internal voice-worker → API channel. Mounted at /internal/v1/calls (excluded
 * from the public `api/v1` prefix in main.ts). `@Public()` skips the user-JWT
 * guards; `InternalAuthGuard` enforces the service token + HMAC signature.
 */
@Public()
@UseGuards(InternalAuthGuard)
@Controller("internal/v1/calls")
export class InternalController {
  constructor(private readonly internal: InternalService) {}

  @Post()
  createCall(
    @Body(new ZodValidationPipe(internalCreateCallRequestSchema)) body: InternalCreateCallRequest,
  ): Promise<InternalCreateCallResponse> {
    return this.internal.createCall(body);
  }

  @Post(":id/events")
  appendEvent(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(callEventReportSchema)) body: CallEventReport,
  ): Promise<{ id: string }> {
    return this.internal.appendEvent(id, body);
  }

  @Post(":id/transcript")
  appendTranscript(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(transcriptTurnReportSchema)) body: TranscriptTurnReport,
  ): Promise<{ id: string }> {
    return this.internal.appendTranscriptTurn(id, body);
  }

  @Patch(":id")
  updateCall(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(callUpdateReportSchema)) body: CallUpdateReport,
  ): Promise<CallDto> {
    return this.internal.updateCall(id, body);
  }

  @Post(":id/usage")
  reportUsage(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(usageReportSchema)) body: UsageReport,
  ): Promise<{ id: string }> {
    return this.internal.reportUsage(id, body);
  }

  @Post(":id/tools/knowledge-retrieval")
  knowledgeRetrieval(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(knowledgeRetrievalToolRequestSchema)) body: KnowledgeRetrievalToolRequest,
  ): Promise<KnowledgeRetrievalToolResponse> {
    return this.internal.knowledgeRetrieval(id, body);
  }

  @Post(":id/tools/book-appointment")
  bookAppointment(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(bookAppointmentToolRequestSchema)) body: BookAppointmentToolRequest,
  ): Promise<BookAppointmentToolResponse> {
    return this.internal.bookAppointment(id, body);
  }

  @Post(":id/tools/transfer")
  transfer(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(transferCallToolRequestSchema)) body: TransferCallToolRequest,
  ): Promise<TransferCallToolResponse> {
    return this.internal.transferCall(id, body);
  }

  @Post(":id/wer")
  recordWer(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(recordWerRequestSchema)) body: RecordWerRequest,
  ): Promise<{ id: string }> {
    return this.internal.recordWer(id, body);
  }
}
