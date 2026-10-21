import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@ovozai/database";
import { cosineSimilarity, type EmbeddingProvider } from "@ovozai/integrations";
import type {
  BookAppointmentToolRequest,
  BookAppointmentToolResponse,
  CallDto,
  CallEventReport,
  CallUpdateReport,
  InternalCreateCallRequest,
  InternalCreateCallResponse,
  KnowledgeRetrievalToolRequest,
  KnowledgeRetrievalToolResponse,
  Language,
  RetrievalResult,
  TranscriptTurnReport,
  UsageReport,
  VoiceAgentConfig,
} from "@ovozai/contracts";
import { AuditService } from "../audit/audit.service";
import { Problems } from "../common/problem.exception";
import { toCallDto } from "../common/mappers";
import { PrismaService } from "../prisma/prisma.service";
import { EMBEDDING_PROVIDER } from "../knowledge/embedding.provider";

function orderedLanguages(primary: Language): Language[] {
  const all: Language[] = ["UZ", "RU", "EN"];
  return [primary, ...all.filter((l) => l !== primary)];
}

function periodKeyFor(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

@Injectable()
export class InternalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(EMBEDDING_PROVIDER) private readonly embedder: EmbeddingProvider,
  ) {}

  /** Create a call and return the agent config the voice-worker loads at start. */
  async createCall(dto: InternalCreateCallRequest): Promise<InternalCreateCallResponse> {
    const agent = await this.prisma.base.agent.findFirst({
      where: { id: dto.agentId, deletedAt: null },
    });
    if (!agent) {
      throw Problems.notFound("Agent not found.");
    }
    const organizationId = agent.organizationId;
    const language = dto.language ?? agent.defaultLanguage;

    const call = await this.prisma.base.call.create({
      data: {
        organizationId,
        agentId: agent.id,
        direction: dto.direction,
        status: "RINGING",
        fromE164: dto.fromE164,
        toE164: dto.toE164,
        externalRef: dto.externalRef,
        language,
      },
    });

    await this.audit.record({
      organizationId,
      actorType: "SYSTEM",
      action: "call.created",
      targetType: "Call",
      targetId: call.id,
    });

    const config = agent.config as Record<string, unknown> | null;
    const consent =
      config && typeof config.consentAnnouncement === "string" ? config.consentAnnouncement : null;

    const agentConfig: VoiceAgentConfig = {
      agentId: agent.id,
      name: agent.name,
      defaultLanguage: agent.defaultLanguage,
      languages: orderedLanguages(agent.defaultLanguage),
      systemPrompt: agent.systemPrompt ?? "You are a helpful voice receptionist.",
      greeting: agent.greeting ?? "Hello, thank you for calling. How can I help you?",
      consentAnnouncement: consent,
      voiceId: agent.voiceId ?? null,
      transferNumber: agent.transferNumber ?? null,
      config: config as VoiceAgentConfig["config"],
    };

    return { callId: call.id, organizationId, agent: agentConfig };
  }

  async appendEvent(callId: string, dto: CallEventReport): Promise<{ id: string }> {
    const call = await this.loadCall(callId);
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    const existing = await this.prisma.base.callEvent.findFirst({
      where: { callId, type: dto.type, occurredAt },
    });
    if (existing) {
      return { id: existing.id };
    }
    const event = await this.prisma.base.callEvent.create({
      data: {
        callId,
        organizationId: call.organizationId,
        type: dto.type,
        payload: { ...(dto.payload ?? {}), eventId: dto.eventId } as Prisma.InputJsonValue,
        occurredAt,
      },
    });
    return { id: event.id };
  }

  async appendTranscriptTurn(callId: string, dto: TranscriptTurnReport): Promise<{ id: string }> {
    const call = await this.loadCall(callId);
    let transcript = await this.prisma.base.transcript.findFirst({ where: { callId } });
    transcript ??= await this.prisma.base.transcript.create({
      data: { callId, organizationId: call.organizationId, language: call.language },
    });

    const duplicate = await this.prisma.base.transcriptTurn.findFirst({
      where: { transcriptId: transcript.id, startMs: dto.startMs, role: dto.role, text: dto.text },
    });
    if (duplicate) {
      return { id: duplicate.id };
    }

    const turn = await this.prisma.base.transcriptTurn.create({
      data: {
        transcriptId: transcript.id,
        organizationId: call.organizationId,
        role: dto.role,
        text: dto.text,
        startMs: dto.startMs,
        endMs: dto.endMs,
        confidence: dto.confidence,
        language: dto.language,
      },
    });

    const prefix = transcript.fullText ? `${transcript.fullText}\n` : "";
    await this.prisma.base.transcript.update({
      where: { id: transcript.id },
      data: { fullText: `${prefix}${dto.role}: ${dto.text}` },
    });

    return { id: turn.id };
  }

  async updateCall(callId: string, dto: CallUpdateReport): Promise<CallDto> {
    await this.loadCall(callId);
    const updated = await this.prisma.base.call.update({
      where: { id: callId },
      data: {
        status: dto.status,
        answeredAt: dto.answeredAt ? new Date(dto.answeredAt) : undefined,
        endedAt: dto.endedAt ? new Date(dto.endedAt) : undefined,
        durationSec: dto.durationSec,
        endedReason: dto.endedReason,
        recordingObjectKey: dto.recordingObjectKey,
        costCents: dto.costCents,
      },
    });
    return toCallDto(updated);
  }

  async reportUsage(callId: string, dto: UsageReport): Promise<{ id: string }> {
    const call = await this.loadCall(callId);
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    const record = await this.prisma.base.usageRecord.create({
      data: {
        organizationId: call.organizationId,
        metric: dto.metric,
        quantity: new Prisma.Decimal(dto.quantity),
        callId,
        occurredAt,
        periodKey: dto.periodKey ?? periodKeyFor(occurredAt),
      },
    });
    return { id: record.id };
  }

  /** `knowledge_retrieval` tool — org-scoped from the call. */
  async knowledgeRetrieval(
    callId: string,
    dto: KnowledgeRetrievalToolRequest,
  ): Promise<KnowledgeRetrievalToolResponse> {
    const call = await this.loadCall(callId);
    const [queryVector] = await this.embedder.embed([dto.query]);
    if (!queryVector) {
      return { results: [] };
    }
    const chunks = await this.prisma.base.knowledgeChunk.findMany({
      where: { organizationId: call.organizationId, embeddingModel: this.embedder.model },
      select: { id: true, documentId: true, ordinal: true, content: true, embedding: true },
    });
    const ranked = chunks
      .map((chunk) => ({ chunk, score: cosineSimilarity(queryVector, chunk.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, dto.topK);

    const documentIds = [...new Set(ranked.map((r) => r.chunk.documentId))];
    const documents = await this.prisma.base.knowledgeDocument.findMany({
      where: { organizationId: call.organizationId, id: { in: documentIds } },
      select: { id: true, title: true },
    });
    const titleById = new Map(documents.map((d) => [d.id, d.title]));

    const results: RetrievalResult[] = ranked.map(({ chunk, score }) => ({
      chunkId: chunk.id,
      documentId: chunk.documentId,
      documentTitle: titleById.get(chunk.documentId) ?? "",
      ordinal: chunk.ordinal,
      content: chunk.content,
      score,
    }));
    return { results };
  }

  /** `book_appointment` tool — org-scoped from the call. */
  async bookAppointment(
    callId: string,
    dto: BookAppointmentToolRequest,
  ): Promise<BookAppointmentToolResponse> {
    const call = await this.loadCall(callId);
    const organizationId = call.organizationId;

    let customerId = call.customerId;
    if (!customerId) {
      const phone = dto.phone ?? call.fromE164 ?? null;
      if (phone) {
        const existing = await this.prisma.base.customer.findFirst({
          where: { organizationId, phoneE164: phone, deletedAt: null },
        });
        customerId =
          existing?.id ??
          (
            await this.prisma.base.customer.create({
              data: { organizationId, phoneE164: phone, name: dto.customerName },
            })
          ).id;
      } else {
        const created = await this.prisma.base.customer.create({
          data: { organizationId, phoneE164: "+000000000000", name: dto.customerName ?? "Caller" },
        });
        customerId = created.id;
      }
      await this.prisma.base.call.update({ where: { id: call.id }, data: { customerId } });
    }

    const appointment = await this.prisma.base.appointment.create({
      data: {
        organizationId,
        customerId,
        agentId: call.agentId,
        title: dto.title,
        notes: dto.notes,
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      },
    });

    await this.audit.record({
      organizationId,
      actorType: "SYSTEM",
      action: "appointment.booked_by_agent",
      targetType: "Appointment",
      targetId: appointment.id,
      metadata: { callId },
    });

    return {
      appointmentId: appointment.id,
      customerId,
      status: appointment.status,
      startsAt: appointment.startsAt.toISOString(),
    };
  }

  private async loadCall(callId: string) {
    const call = await this.prisma.base.call.findFirst({ where: { id: callId } });
    if (!call) {
      throw Problems.notFound("Call not found.");
    }
    return call;
  }
}
