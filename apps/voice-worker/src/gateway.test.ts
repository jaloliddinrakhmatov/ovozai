import { createHmac } from "node:crypto";
import { once } from "node:events";
import { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createVoiceProviders } from "@ovozai/integrations";
import type {
  InternalCreateCallResponse,
  VoiceAgentConfig,
  VoiceServerMessage,
} from "@ovozai/contracts";
import { startVoiceGateway, verifyTestTicket } from "./gateway";
import type { VoiceInternalClient } from "./internal-client";

const SECRET = "unit-test-hmac-secret";

function signTicket(payload: Record<string, unknown>): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(b64).digest("hex");
  return `${b64}.${sig}`;
}

const AGENT: VoiceAgentConfig = {
  agentId: "agent-1",
  systemPrompt: "You are a helpful receptionist.",
  greeting: "Hello, how can I help?",
  defaultLanguage: "EN",
  languages: ["EN", "UZ", "RU"],
  voiceId: "default",
} as VoiceAgentConfig;

/** In-memory internal client capturing what the session reports. */
function mockInternal() {
  const state = { turns: [] as { role: string; text: string }[], finalStatus: "" as string };
  const client: VoiceInternalClient = {
    createCall: async (): Promise<InternalCreateCallResponse> =>
      ({ callId: "call-1", organizationId: "org-1", agent: AGENT }) as InternalCreateCallResponse,
    appendEvent: async () => ({ id: "e" }),
    appendTranscriptTurn: async (_callId, req) => {
      state.turns.push({ role: req.role, text: req.text });
      return { id: "t" };
    },
    updateCall: async (_callId, req) => {
      if (req.status) state.finalStatus = req.status;
      return {};
    },
    reportUsage: async () => ({ id: "u" }),
    knowledgeRetrieval: async () =>
      ({ results: [{ content: "We are open 9:00–18:00, Monday to Saturday." }] }) as never,
    bookAppointment: async () => ({ appointmentId: "a", startsAt: new Date().toISOString() }) as never,
    transferCall: async () => ({ status: "TRANSFERRED" }) as never,
    recordWer: async () => ({ id: "w" }),
  };
  return { client, state };
}

describe("verifyTestTicket", () => {
  it("accepts a valid, unexpired ticket", () => {
    const ticket = signTicket({ agentId: "a", organizationId: "o", exp: 9999999999 });
    expect(verifyTestTicket(ticket, SECRET)).toMatchObject({ agentId: "a", organizationId: "o" });
  });
  it("rejects a tampered signature", () => {
    const ticket = signTicket({ agentId: "a", organizationId: "o", exp: 9999999999 });
    expect(verifyTestTicket(ticket.slice(0, -1) + "0", SECRET)).toBeNull();
  });
  it("rejects a wrong secret", () => {
    const ticket = signTicket({ agentId: "a", organizationId: "o", exp: 9999999999 });
    expect(verifyTestTicket(ticket, "other-secret")).toBeNull();
  });
  it("rejects an expired ticket", () => {
    const ticket = signTicket({ agentId: "a", organizationId: "o", exp: 100 });
    expect(verifyTestTicket(ticket, SECRET, 200)).toBeNull();
  });
  it("rejects malformed input", () => {
    expect(verifyTestTicket("not-a-ticket", SECRET)).toBeNull();
  });
});

describe("voice gateway (browser Test-Agent path, end-to-end over a real WebSocket)", () => {
  it("runs a real CallSession: greeting, knowledge answer, and clean end", async () => {
    const { client, state } = mockInternal();
    const wss = startVoiceGateway({
      port: 0,
      hmacSecret: SECRET,
      internal: client,
      providers: createVoiceProviders({ provider: "local" }),
      maxSessions: 4,
    });
    await once(wss, "listening");
    const port = (wss.address() as AddressInfo).port;

    const ticket = signTicket({ agentId: "agent-1", organizationId: "org-1", exp: 9999999999 });
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?ticket=${ticket}`);
    const messages: VoiceServerMessage[] = [];
    ws.on("message", (raw) => messages.push(JSON.parse(String(raw)) as VoiceServerMessage));

    await once(ws, "open");
    ws.send(JSON.stringify({ type: "caller_text", text: "What are your opening hours?", language: "en" }));
    ws.send(JSON.stringify({ type: "caller_text", text: "Thanks, goodbye", language: "en" }));
    await once(ws, "close");
    wss.close();

    const captions = messages.filter((m) => m.type === "caption") as Extract<
      VoiceServerMessage,
      { type: "caption" }
    >[];
    const agentText = captions
      .filter((c) => c.role === "AGENT")
      .map((c) => c.text)
      .join(" | ");

    // Lifecycle messages reached the browser.
    expect(messages.some((m) => m.type === "call")).toBe(true);
    expect(messages.some((m) => m.type === "state" && m.state === "in_call")).toBe(true);
    // Greeting + a knowledge-grounded answer were spoken.
    expect(agentText).toContain("Hello, how can I help?");
    expect(agentText).toContain("9:00–18:00");
    // Caller turns were echoed as captions and reported to the control plane.
    expect(captions.some((c) => c.role === "CALLER" && c.text.includes("opening hours"))).toBe(true);
    expect(state.turns.some((t) => t.role === "CALLER")).toBe(true);
    // The call was closed as COMPLETED via the internal channel.
    expect(state.finalStatus).toBe("COMPLETED");
  });

  it("rejects a connection with an invalid ticket", async () => {
    const { client } = mockInternal();
    const wss = startVoiceGateway({
      port: 0,
      hmacSecret: SECRET,
      internal: client,
      providers: createVoiceProviders({ provider: "local" }),
      maxSessions: 4,
    });
    await once(wss, "listening");
    const port = (wss.address() as AddressInfo).port;

    const ws = new WebSocket(`ws://127.0.0.1:${port}/?ticket=bogus`);
    const messages: VoiceServerMessage[] = [];
    ws.on("message", (raw) => messages.push(JSON.parse(String(raw)) as VoiceServerMessage));
    await once(ws, "close");
    wss.close();

    expect(messages.some((m) => m.type === "error" && /ticket/i.test(m.message))).toBe(true);
  });
});
