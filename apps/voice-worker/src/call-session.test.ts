import { describe, expect, it } from "vitest";
import { createVoiceProviders } from "@ovozai/integrations";
import type {
  BookAppointmentToolRequest,
  BookAppointmentToolResponse,
  CallEventReport,
  CallUpdateReport,
  KnowledgeRetrievalToolRequest,
  KnowledgeRetrievalToolResponse,
  RecordWerRequest,
  TranscriptTurnReport,
  TransferCallToolRequest,
  TransferCallToolResponse,
  UsageReport,
  VoiceAgentConfig,
} from "@ovozai/contracts";
import { CallSession } from "./call-session";
import { SimulatedTransport } from "./transport";
import type { VoiceInternalClient } from "./internal-client";

class FakeInternalClient implements VoiceInternalClient {
  events: string[] = [];
  turns: Array<{ role: string; text: string }> = [];
  updates: CallUpdateReport[] = [];
  usages: UsageReport[] = [];

  createCall(): never {
    throw new Error("not used in this test");
  }
  async appendEvent(_callId: string, req: CallEventReport): Promise<{ id: string }> {
    this.events.push(req.type);
    return { id: "evt" };
  }
  async appendTranscriptTurn(_callId: string, req: TranscriptTurnReport): Promise<{ id: string }> {
    this.turns.push({ role: req.role, text: req.text });
    return { id: "turn" };
  }
  async updateCall(_callId: string, req: CallUpdateReport): Promise<unknown> {
    this.updates.push(req);
    return {};
  }
  async reportUsage(_callId: string, req: UsageReport): Promise<{ id: string }> {
    this.usages.push(req);
    return { id: "usage" };
  }
  async knowledgeRetrieval(
    _callId: string,
    _req: KnowledgeRetrievalToolRequest,
  ): Promise<KnowledgeRetrievalToolResponse> {
    return {
      results: [
        {
          chunkId: "11111111-1111-1111-1111-111111111111",
          documentId: "22222222-2222-2222-2222-222222222222",
          documentTitle: "hours",
          ordinal: 0,
          content: "We are open from 9 to 6.",
          score: 0.9,
        },
      ],
    };
  }
  async bookAppointment(
    _callId: string,
    req: BookAppointmentToolRequest,
  ): Promise<BookAppointmentToolResponse> {
    return {
      appointmentId: "33333333-3333-3333-3333-333333333333",
      customerId: "44444444-4444-4444-4444-444444444444",
      status: "PENDING",
      startsAt: req.startsAt,
    };
  }
  transfers: TransferCallToolRequest[] = [];
  async transferCall(
    _callId: string,
    req: TransferCallToolRequest,
  ): Promise<TransferCallToolResponse> {
    this.transfers.push(req);
    return { status: "transferred", target: req.target, mode: req.mode };
  }
  async recordWer(_callId: string, _req: RecordWerRequest): Promise<{ id: string }> {
    return { id: "wer" };
  }
}

const AGENT: VoiceAgentConfig = {
  agentId: "a1",
  name: "Reception",
  defaultLanguage: "EN",
  languages: ["EN", "UZ", "RU"],
  systemPrompt: "You are a helpful receptionist.",
  greeting: "Hello, thanks for calling.",
  consentAnnouncement: "This call may be recorded.",
  voiceId: null,
  transferNumber: null,
  config: null,
};

describe("CallSession (simulated call through the real local pipeline)", () => {
  it("runs STT→LLM→TTS, tools, barge-in, and reports to the internal channel", async () => {
    const internal = new FakeInternalClient();
    const transport = new SimulatedTransport([
      { text: "What are your opening hours?", language: "en" },
      { text: "I want to book an appointment", language: "en" },
      { text: "Thanks, goodbye", language: "en", bargeInAfterChunks: 1 },
    ]);

    const session = new CallSession({
      callId: "call-1",
      organizationId: "org-1",
      agent: AGENT,
      providers: createVoiceProviders({ provider: "local" }),
      internal,
      transport,
    });

    await session.run();

    expect(session.currentState).toBe("ended");

    // Caller turns transcribed, greeting + replies reported.
    const callerTexts = internal.turns.filter((t) => t.role === "CALLER").map((t) => t.text);
    expect(callerTexts).toContain("What are your opening hours?");
    const agentTexts = internal.turns.filter((t) => t.role === "AGENT").map((t) => t.text);
    expect(agentTexts.some((t) => t.includes("Hello, thanks for calling."))).toBe(true);

    // Knowledge-grounded answer surfaced from the tool result.
    expect(agentTexts.some((t) => t.includes("We are open from 9 to 6."))).toBe(true);
    expect(transport.spokenText.some((t) => t.includes("We are open from 9 to 6."))).toBe(true);

    // Booking happened.
    expect(agentTexts.some((t) => t.toLowerCase().includes("booked"))).toBe(true);

    // Lifecycle + tools + barge-in + end reported.
    expect(internal.events).toContain("call.started");
    expect(internal.events).toContain("tool.invoked");
    expect(internal.events).toContain("barge_in");
    expect(internal.events).toContain("call.ended");

    // Call marked in-progress then completed; usage metered.
    expect(internal.updates.some((u) => u.status === "IN_PROGRESS")).toBe(true);
    expect(internal.updates.some((u) => u.status === "COMPLETED")).toBe(true);
    expect(internal.usages.some((u) => u.metric === "CALL_MINUTES")).toBe(true);
  });

  it("transfers the call to a human when the caller asks for one", async () => {
    const internal = new FakeInternalClient();
    const transport = new SimulatedTransport([
      { text: "Please connect me to a human operator", language: "en" },
    ]);
    const session = new CallSession({
      callId: "call-2",
      organizationId: "org-1",
      agent: { ...AGENT, transferNumber: "+998901112233" },
      providers: createVoiceProviders({ provider: "local" }),
      internal,
      transport,
    });

    await session.run();

    expect(internal.transfers).toHaveLength(1);
    expect(internal.transfers[0]!.target).toBe("+998901112233");
    expect(internal.updates.some((u) => u.status === "TRANSFERRED")).toBe(true);
  });
});
