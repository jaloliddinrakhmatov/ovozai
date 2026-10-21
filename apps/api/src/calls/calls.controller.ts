import { Controller, Get, Param, Query } from "@nestjs/common";
import {
  callListQuerySchema,
  paginationQuerySchema,
  type CallDto,
  type CallListQuery,
  type PaginationQuery,
  type RecordingUrlResponse,
  type TranscriptDto,
} from "@ovozai/contracts";
import { Roles } from "../common/roles.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CallsService } from "./calls.service";

@Controller("calls")
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Get()
  @Roles("VIEWER")
  list(@Query(new ZodValidationPipe(callListQuerySchema)) query: CallListQuery) {
    return this.calls.list(query);
  }

  @Get(":id/events")
  @Roles("VIEWER")
  listEvents(
    @Param("id") id: string,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ) {
    return this.calls.listEvents(id, query);
  }

  @Get(":id/transcript")
  @Roles("VIEWER")
  getTranscript(@Param("id") id: string): Promise<TranscriptDto> {
    return this.calls.getTranscript(id);
  }

  @Get(":id/recording")
  @Roles("ADMIN")
  getRecording(@Param("id") id: string): Promise<RecordingUrlResponse> {
    return this.calls.getRecording(id);
  }

  @Get(":id")
  @Roles("VIEWER")
  get(@Param("id") id: string): Promise<CallDto> {
    return this.calls.get(id);
  }
}
