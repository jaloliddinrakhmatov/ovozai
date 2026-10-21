import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@ovozai/database";
import type { StorageProvider } from "@ovozai/integrations";
import type {
  CallDto,
  CallEventDto,
  CallListQuery,
  PaginationQuery,
  RecordingUrlResponse,
  TranscriptDto,
} from "@ovozai/contracts";
import { Problems } from "../common/problem.exception";
import { toCallDto, toCallEventDto, toTranscriptDto } from "../common/mappers";
import { PrismaService } from "../prisma/prisma.service";
import { STORAGE_PROVIDER } from "./storage.provider";

interface Page<T> {
  data: T[];
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
}

@Injectable()
export class CallsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async list(query: CallListQuery): Promise<Page<CallDto>> {
    const where: Prisma.CallWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.direction) where.direction = query.direction;
    if (query.agentId) where.agentId = query.agentId;
    if (query.from || query.to) {
      where.startedAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lt: new Date(query.to) } : {}),
      };
    }

    const take = query.limit;
    const rows = await this.prisma.tenant.call.findMany({
      where,
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > take;
    const page = hasNextPage ? rows.slice(0, take) : rows;
    return {
      data: page.map(toCallDto),
      pageInfo: { nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null, hasNextPage },
    };
  }

  async get(id: string): Promise<CallDto> {
    return toCallDto(await this.load(id));
  }

  async listEvents(id: string, query: PaginationQuery): Promise<Page<CallEventDto>> {
    await this.load(id);
    const take = query.limit;
    const rows = await this.prisma.tenant.callEvent.findMany({
      where: { callId: id },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > take;
    const page = hasNextPage ? rows.slice(0, take) : rows;
    return {
      data: page.map(toCallEventDto),
      pageInfo: { nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null, hasNextPage },
    };
  }

  async getTranscript(id: string): Promise<TranscriptDto> {
    await this.load(id);
    const transcript = await this.prisma.tenant.transcript.findFirst({
      where: { callId: id },
      include: { turns: { orderBy: { startMs: "asc" } } },
    });
    if (!transcript) {
      throw Problems.notFound("No transcript for this call yet.");
    }
    return toTranscriptDto(transcript);
  }

  async getRecording(id: string): Promise<RecordingUrlResponse> {
    const call = await this.load(id);
    if (!call.recordingObjectKey) {
      return { url: null, expiresAt: null };
    }
    const url = await this.storage.getUrl(call.recordingObjectKey, 900);
    return { url, expiresAt: url ? new Date(Date.now() + 900_000).toISOString() : null };
  }

  private async load(id: string) {
    const call = await this.prisma.tenant.call.findFirst({ where: { id } });
    if (!call) {
      throw Problems.notFound("Call not found.");
    }
    return call;
  }
}
