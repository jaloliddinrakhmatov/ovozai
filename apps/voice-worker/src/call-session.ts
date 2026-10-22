import { randomUUID } from "node:crypto";
import type {
  AudioChunk,
  LlmMessage,
  LlmProvider,
  LlmTool,
  SttProvider,
  StorageProvider,
  TtsProvider,
} from "@ovozai/integrations";
import type { Language, TranscriptRole, VoiceAgentConfig } from "@ovozai/contracts";
import type { AudioTransport, PlaybackResult } from "./transport";
import type { VoiceInternalClient } from "./internal-client";

export type CallState = "ringing" | "greeting" | "listening" | "thinking" | "speaking" | "ended";

export interface CallSessionDeps {
  callId: string;
  organizationId: string;
  agent: VoiceAgentConfig;
  providers: { stt: SttProvider; llm: LlmProvider; tts: TtsProvider };
  internal: VoiceInternalClient;
  transport: AudioTransport;
  storage?: StorageProvider;
  llmModel?: string;
  /** Called for every finalized transcript turn (for live browser captions). */
  onTranscript?: (turn: { role: TranscriptRole; text: string; language: Language }) => void;
  logger?: (message: string) => void;
}

/** The LLM tool catalog (docs/VOICE_PIPELINE.md §7). */
const TOOL_SCHEMAS: LlmTool[] = [
  {
    name: "knowledge_retrieval",
    description: "Answer a caller question from the organization's knowledge base.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" }, topK: { type: "number" }, language: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "check_availability",
    description:
      "Check whether a specific date/time is open before booking. Returns whether it is available and, if not, the nearest alternative times. Prefer calling this when the caller proposes a time.",
    parameters: {
      type: "object",
      properties: {
        startsAt: { type: "string", description: "Desired start, ISO 8601 (e.g. 2026-10-23T14:00:00Z)." },
        durationMinutes: { type: "number" },
      },
      required: ["startsAt"],
    },
  },
  {
    name: "book_appointment",
    description:
      "Book an appointment for the caller at a confirmed, available time. If the slot is taken or outside business hours this returns booked=false with alternative times to offer the caller.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        startsAt: { type: "string", description: "ISO 8601 start time." },
        endsAt: { type: "string" },
        durationMinutes: { type: "number" },
        customerName: { type: "string" },
        phone: { type: "string" },
        notes: { type: "string" },
      },
      required: ["title", "startsAt"],
    },
  },
  {
    name: "reschedule_appointment",
    description:
      "Move the caller's existing upcoming appointment to a new time. Defaults to their soonest upcoming appointment when no id is given.",
    parameters: {
      type: "object",
      properties: {
        newStartsAt: { type: "string", description: "New ISO 8601 start time." },
        newEndsAt: { type: "string" },
        durationMinutes: { type: "number" },
        appointmentId: { type: "string" },
      },
      required: ["newStartsAt"],
    },
  },
  {
    name: "cancel_appointment",
    description:
      "Cancel the caller's existing upcoming appointment. Defaults to their soonest upcoming appointment when no id is given.",
    parameters: {
      type: "object",
      properties: {
        appointmentId: { type: "string" },
        reason: { type: "string" },
      },
    },
  },
  {
    name: "transfer_call",
    description: "Transfer the caller to a human (warm or cold handoff).",
    parameters: {
      type: "object",
      properties: {
        target: { type: "string" },
        mode: { type: "string", enum: ["warm", "cold"] },
        reason: { type: "string" },
      },
    },
  },
  {
    name: "end_call",
    description: "End the call politely once the caller's goal is complete.",
    parameters: {
      type: "object",
      properties: { reason: { type: "string" }, disposition: { type: "string" } },
    },
  },
];

/**
 * Appended to every agent's system prompt so replies sound like a real, busy
 * receptionist — and so each spoken turn stays cheap (TTS is billed per
 * character). Kept provider-neutral; the model still answers in the caller's
 * language and follows the business-specific prompt above it.
 */
const STYLE_DIRECTIVE = [
  "Speak like a warm, efficient phone receptionist.",
  "Reply in the caller's language.",
  "Keep every reply to one or two short sentences — never read long lists or paragraphs aloud.",
  "Ask only one question at a time.",
  "When booking, confirm the exact date and time; if a time is unavailable, offer the alternatives you are given.",
].join(" ");

/** The booking timezone from the agent config, or the UZ default. */
function bookingTimezone(config: VoiceAgentConfig["config"]): string {
  if (config && typeof config === "object") {
    const booking = (config as Record<string, unknown>).booking;
    if (booking && typeof booking === "object") {
      const tz = (booking as Record<string, unknown>).timezone;
      if (typeof tz === "string" && tz.trim()) return tz;
    }
  }
  return "Asia/Tashkent";
}

/**
 * A line appended to the system prompt so the model can resolve relative times
 * ("tomorrow", "this Friday") into concrete ISO timestamps when booking.
 */
function nowContext(tz: string): string {
  let when: string;
  try {
    when = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date());
  } catch {
    when = new Date().toISOString();
  }
  return `Current date and time: ${when} (timezone ${tz}). Resolve relative times like "today", "tomorrow", or "this Friday" against this, and always pass appointment times as full ISO 8601 timestamps.`;
}

function langToCode(language: Language): "uz" | "ru" | "en" {
  return language === "UZ" ? "uz" : language === "RU" ? "ru" : "en";
}

function codeToLang(code: string | undefined): Language | undefined {
  switch (code?.toLowerCase()) {
    case "uz":
      return "UZ";
    case "ru":
      return "RU";
    case "en":
      return "EN";
    default:
      return undefined;
  }
}

/** A short spoken line for an unbookable slot, offering any alternatives. */
function unavailableText(
  reason: "past" | "out_of_hours" | "conflict" | undefined,
  suggestions: string[] | undefined,
): string {
  const lead =
    reason === "past"
      ? "That time has already passed."
      : reason === "out_of_hours"
        ? "That's outside our opening hours."
        : "That time is already taken.";
  const alts = (suggestions ?? []).slice(0, 2);
  if (alts.length === 0) {
    return `${lead} What other time works for you?`;
  }
  const list = alts.length === 1 ? alts[0]! : `${alts[0]!} or ${alts[1]!}`;
  return `${lead} I can offer ${list}. Which works?`;
}

function safeJson(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

interface ThinkResult {
  kind: "speak" | "end";
  text: string;
  reason?: string;
  endStatus?: "COMPLETED" | "TRANSFERRED";
}

/**
 * Drives a single call through its lifecycle (docs/VOICE_PIPELINE.md §4.2). Per
 * caller turn it runs STT → LLM (with tools) → TTS, supports barge-in, and
 * reports transcript turns + lifecycle events to the control plane over the
 * internal channel. Tenant data is never written directly — only via the API.
 */
export class CallSession {
  private state: CallState = "ringing";
  private readonly startedAt = Date.now();
  private readonly messages: LlmMessage[] = [];
  private turnCount = 0;
  private llmTokenEstimate = 0;
  private endedReason = "caller_hangup";
  private endStatus: "COMPLETED" | "TRANSFERRED" | "FAILED" = "COMPLETED";
  private recordingConsent = false;
  private readonly transcriptLog: string[] = [];

  constructor(private readonly deps: CallSessionDeps) {
    const tz = bookingTimezone(deps.agent.config);
    this.messages.push({
      role: "system",
      content: `${deps.agent.systemPrompt}\n\n${STYLE_DIRECTIVE}\n\n${nowContext(tz)}`,
    });
  }

  get currentState(): CallState {
    return this.state;
  }

  async run(): Promise<void> {
    const { internal, callId, agent } = this.deps;
    await internal
      .updateCall(callId, { status: "IN_PROGRESS", answeredAt: new Date().toISOString() })
      .catch((e) => this.warn(e));
    await this.event("call.started", { agentId: agent.agentId });

    // Greeting + recording-consent announcement (played fully). A played consent
    // announcement is the lawful basis for recording (two-party consent).
    this.state = "greeting";
    this.recordingConsent = Boolean(agent.consentAnnouncement);
    if (this.recordingConsent) {
      await this.event("consent.captured", { method: "announcement" });
    }
    const greeting = [agent.consentAnnouncement, agent.greeting].filter(Boolean).join(" ");
    await this.reportTurn("AGENT", greeting, 0, agent.defaultLanguage);
    await this.speak(greeting);

    this.state = "listening";
    for (;;) {
      const turn = await this.deps.transport.nextCallerTurn();
      if (!turn) {
        this.endedReason = "caller_hangup";
        break;
      }
      this.turnCount += 1;
      const baseMs = this.turnCount * 2000;

      // A turn may arrive already transcribed (type-to-talk, or browser-side
      // speech recognition) — then skip STT entirely. Otherwise run STT on audio.
      const { text, language } =
        turn.text != null
          ? { text: turn.text.trim(), language: codeToLang(turn.language) }
          : await this.transcribe(turn.audio, turn.language);
      if (!text) continue;
      await this.reportTurn("CALLER", text, baseMs, language ?? agent.defaultLanguage);
      this.messages.push({ role: "user", content: text });

      this.state = "thinking";
      const result = await this.think();
      await this.reportTurn("AGENT", result.text, baseMs + 1000, agent.defaultLanguage);
      this.messages.push({ role: "assistant", content: result.text });

      this.state = "speaking";
      const playback = await this.speak(result.text);
      if (playback.bargedIn) {
        await this.event("barge_in", { turn: this.turnCount });
      }

      if (result.kind === "end") {
        this.endedReason = result.reason ?? "agent_ended";
        this.endStatus = result.endStatus ?? "COMPLETED";
        break;
      }
      this.state = "listening";
    }

    await this.end();
  }

  private async transcribe(
    audio: AsyncIterable<AudioChunk>,
    hintLanguage: string | undefined,
  ): Promise<{ text: string; language: Language | undefined }> {
    const agentLangs = this.deps.agent.languages.map(langToCode);
    const languages = hintLanguage ? [hintLanguage, ...agentLangs] : agentLangs;
    let finalText = "";
    let detected: string | undefined;
    for await (const result of this.deps.providers.stt.transcribe(audio, { languages })) {
      if (result.isFinal) {
        finalText = result.transcript;
        detected = result.detectedLanguage;
      }
    }
    return { text: finalText.trim(), language: codeToLang(detected ?? hintLanguage) };
  }

  private async think(): Promise<ThinkResult> {
    const model = this.deps.llmModel ?? "gpt-4o-mini";
    for (let round = 0; round < 4; round += 1) {
      let text = "";
      let toolName: string | undefined;
      let toolId = "";
      let toolArgs = "";
      for await (const chunk of this.deps.providers.llm.complete({
        model,
        messages: this.messages,
        tools: TOOL_SCHEMAS,
        temperature: 0.3,
        // Short, receptionist-style turns (see STYLE_DIRECTIVE) — also keeps
        // per-turn TTS cost low.
        maxTokens: 160,
      })) {
        if (chunk.textDelta) {
          text += chunk.textDelta;
          this.llmTokenEstimate += 1;
        }
        if (chunk.toolCall) {
          toolName ??= chunk.toolCall.name;
          if (!toolId) toolId = chunk.toolCall.id;
          toolArgs += chunk.toolCall.argumentsDelta;
        }
      }

      if (toolName) {
        await this.event("tool.invoked", { name: toolName });
        let outcome: { text: string; end?: boolean; endStatus?: "COMPLETED" | "TRANSFERRED" };
        try {
          outcome = await this.executeTool(toolName, safeJson(toolArgs));
        } catch (error) {
          // A tool failure (bad args, upstream error) must never end the call —
          // feed the model the failure so it recovers in words and keeps talking.
          this.warn(`tool ${toolName} failed: ${error instanceof Error ? error.message : String(error)}`);
          await this.event("tool.failed", {
            name: toolName,
            reason: error instanceof Error ? error.message : String(error),
          });
          this.messages.push({ role: "assistant", content: "" });
          this.messages.push({
            role: "tool",
            content:
              "That action could not be completed. Apologize briefly and ask the caller to restate the details, such as the exact date and time.",
            toolCallId: toolId,
          });
          continue;
        }
        if (outcome.end) {
          return {
            kind: "end",
            text: outcome.text,
            reason: outcome.endStatus === "TRANSFERRED" ? "transferred" : "agent_ended",
            endStatus: outcome.endStatus,
          };
        }
        this.messages.push({ role: "assistant", content: "" });
        this.messages.push({ role: "tool", content: outcome.text, toolCallId: toolId });
        continue;
      }

      // Strip reasoning blocks some models (e.g. Qwen) emit before the answer,
      // so the agent never speaks its chain-of-thought.
      const spoken = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      return { kind: "speak", text: spoken || "I'm sorry, could you repeat that?" };
    }
    return { kind: "speak", text: "Let me connect you to a colleague." };
  }

  private async executeTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ text: string; end?: boolean; endStatus?: "COMPLETED" | "TRANSFERRED" }> {
    const { internal, callId } = this.deps;
    switch (name) {
      case "knowledge_retrieval": {
        const response = await internal.knowledgeRetrieval(callId, {
          query: typeof args.query === "string" ? args.query : "",
          topK: 3,
        });
        const top = response.results[0];
        return { text: top ? top.content : "I don't have information about that just yet." };
      }
      case "check_availability": {
        const response = await internal.checkAvailability(callId, {
          startsAt:
            typeof args.startsAt === "string"
              ? args.startsAt
              : new Date(Date.now() + 86_400_000).toISOString(),
          durationMinutes: typeof args.durationMinutes === "number" ? args.durationMinutes : undefined,
        });
        if (response.available) {
          return { text: `${response.requestedStartsAtText} is available. Shall I book it?` };
        }
        return { text: unavailableText(response.reason, response.suggestionsText) };
      }
      case "book_appointment": {
        const response = await internal.bookAppointment(callId, {
          title: typeof args.title === "string" ? args.title : "Appointment",
          startsAt:
            typeof args.startsAt === "string"
              ? args.startsAt
              : new Date(Date.now() + 86_400_000).toISOString(),
          endsAt: typeof args.endsAt === "string" ? args.endsAt : undefined,
          durationMinutes: typeof args.durationMinutes === "number" ? args.durationMinutes : undefined,
          customerName: typeof args.customerName === "string" ? args.customerName : undefined,
          phone: typeof args.phone === "string" ? args.phone : undefined,
          notes: typeof args.notes === "string" ? args.notes : undefined,
        });
        if (response.booked) {
          return { text: `Booked — ${response.startsAtText ?? response.startsAt}. Anything else?` };
        }
        return { text: unavailableText(response.reason, response.suggestionsText) };
      }
      case "reschedule_appointment": {
        const response = await internal.rescheduleAppointment(callId, {
          newStartsAt:
            typeof args.newStartsAt === "string"
              ? args.newStartsAt
              : new Date(Date.now() + 86_400_000).toISOString(),
          newEndsAt: typeof args.newEndsAt === "string" ? args.newEndsAt : undefined,
          durationMinutes: typeof args.durationMinutes === "number" ? args.durationMinutes : undefined,
          appointmentId: typeof args.appointmentId === "string" ? args.appointmentId : undefined,
        });
        if (response.rescheduled) {
          return { text: `Done — moved to ${response.startsAtText ?? response.startsAt}. Anything else?` };
        }
        if (response.reason === "not_found") {
          return { text: "I couldn't find an upcoming appointment to move. Would you like to book one?" };
        }
        return { text: unavailableText(response.reason, response.suggestionsText) };
      }
      case "cancel_appointment": {
        const response = await internal.cancelAppointment(callId, {
          appointmentId: typeof args.appointmentId === "string" ? args.appointmentId : undefined,
          reason: typeof args.reason === "string" ? args.reason : undefined,
        });
        if (response.canceled) {
          return { text: `Your appointment on ${response.startsAtText ?? response.startsAt} is canceled. Anything else?` };
        }
        return { text: "I couldn't find an upcoming appointment to cancel. Is there anything else?" };
      }
      case "transfer_call": {
        const target =
          this.deps.agent.transferNumber ??
          (typeof args.target === "string" && args.target.length >= 3 ? args.target : "+000000000000");
        const mode = args.mode === "warm" ? "warm" : "cold";
        await this.deps.internal.transferCall(this.deps.callId, {
          target,
          mode,
          reason: typeof args.reason === "string" ? args.reason : undefined,
        });
        return {
          text: "Please hold while I connect you to a colleague.",
          end: true,
          endStatus: "TRANSFERRED",
        };
      }
      case "end_call":
        return { text: "Thank you for calling. Goodbye.", end: true, endStatus: "COMPLETED" };
      default:
        return { text: "I can't do that right now." };
    }
  }

  private async speak(text: string): Promise<PlaybackResult> {
    if (!text) return { bargedIn: false };
    const controller = new AbortController();
    const audio = this.deps.providers.tts.synthesize(
      text,
      { voiceId: this.deps.agent.voiceId ?? "default", language: langToCode(this.deps.agent.defaultLanguage) },
      controller.signal,
    );
    try {
      return await this.deps.transport.playAgentAudio(audio, controller);
    } catch (error) {
      // A TTS failure (e.g. provider out of credits) must not end the call —
      // fall back to client-side speech and keep the conversation going.
      this.warn(`TTS failed, falling back to client speech: ${error instanceof Error ? error.message : String(error)}`);
      await this.event("tts.failed", { reason: error instanceof Error ? error.message : String(error) });
      this.deps.transport.speakTextFallback?.(text);
      return { bargedIn: false };
    }
  }

  private async reportTurn(
    role: TranscriptRole,
    text: string,
    startMs: number,
    language: Language,
  ): Promise<void> {
    this.transcriptLog.push(`${role}: ${text}`);
    this.deps.onTranscript?.({ role, text, language });
    await this.deps.internal
      .appendTranscriptTurn(this.deps.callId, {
        turnId: randomUUID(),
        role,
        text,
        startMs,
        language,
      })
      .catch((e) => this.warn(e));
  }

  private async event(type: string, payload: Record<string, unknown>): Promise<void> {
    await this.deps.internal
      .appendEvent(this.deps.callId, { eventId: randomUUID(), type, payload })
      .catch((e) => this.warn(e));
  }

  private async end(): Promise<void> {
    this.state = "ended";
    const durationSec = Math.max(1, Math.round((Date.now() - this.startedAt) / 1000));

    // Persist the recording (consent-gated). This is a transcript-text placeholder:
    // real call audio is captured at the LiveKit media layer (not wired here).
    let recordingObjectKey: string | undefined;
    if (this.deps.storage && this.recordingConsent) {
      try {
        const key = `org/${this.deps.organizationId}/calls/${this.deps.callId}/recording.txt`;
        await this.deps.storage.put(
          key,
          new TextEncoder().encode(this.transcriptLog.join("\n")),
          "text/plain",
        );
        recordingObjectKey = key;
        await this.event("recording.stored", { key });
      } catch (error) {
        this.warn(error);
      }
    }

    await this.deps.internal
      .updateCall(this.deps.callId, {
        status: this.endStatus,
        endedAt: new Date().toISOString(),
        durationSec,
        endedReason: this.endedReason,
        recordingConsent: this.recordingConsent,
        ...(recordingObjectKey ? { recordingObjectKey } : {}),
      })
      .catch((e) => this.warn(e));
    await this.event("call.ended", {
      durationSec,
      reason: this.endedReason,
      disposition: this.endStatus,
    });
    await this.deps.internal
      .reportUsage(this.deps.callId, { metric: "CALL_MINUTES", quantity: durationSec / 60 })
      .catch((e) => this.warn(e));
    if (this.llmTokenEstimate > 0) {
      await this.deps.internal
        .reportUsage(this.deps.callId, { metric: "LLM_TOKENS", quantity: this.llmTokenEstimate })
        .catch((e) => this.warn(e));
    }
    await this.deps.transport.close();
  }

  private warn(error: unknown): void {
    this.deps.logger?.(`[call ${this.deps.callId}] ${error instanceof Error ? error.message : String(error)}`);
  }
}
