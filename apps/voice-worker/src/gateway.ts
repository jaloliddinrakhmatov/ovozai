import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { StorageProvider, VoiceProviders } from "@ovozai/integrations";
import { CallSession } from "./call-session";
import { WebSocketTransport } from "./websocket-transport";
import type { VoiceInternalClient } from "./internal-client";

export interface TestTicketPayload {
  agentId: string;
  organizationId: string;
  exp: number;
}

/**
 * Verify an API-issued test-session ticket (`<base64url(payload)>.<hmacHex>`).
 * Pure + exported for unit testing. Returns the payload, or null if the signature
 * is invalid/tampered or the ticket has expired. Constant-time signature compare.
 */
export function verifyTestTicket(
  ticket: string,
  secret: string,
  now = Math.floor(Date.now() / 1000),
): TestTicketPayload | null {
  const dot = ticket.lastIndexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = ticket.slice(0, dot);
  const signature = ticket.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(payloadB64).digest("hex");
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  let payload: TestTicketPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as TestTicketPayload;
  } catch {
    return null;
  }
  if (!payload.agentId || !payload.organizationId || typeof payload.exp !== "number") return null;
  if (payload.exp < now) return null;
  return payload;
}

export interface VoiceGatewayDeps {
  port: number;
  hmacSecret: string;
  internal: VoiceInternalClient;
  providers: VoiceProviders;
  storage?: StorageProvider;
  /** LLM model id passed to the session (e.g. a Groq model). */
  llmModel?: string;
  /** True when a real TTS provider supplies audio to play in the browser. */
  serverAudio?: boolean;
  maxSessions: number;
  logger?: (message: string) => void;
}

/**
 * Start the browser "Test Agent" WebSocket gateway. Each connection presents a
 * ticket (`?ticket=`); on success the gateway creates a Call via the internal
 * channel and runs a real CallSession bound to a WebSocketTransport.
 */
export function startVoiceGateway(deps: VoiceGatewayDeps): WebSocketServer {
  const wss = new WebSocketServer({ port: deps.port });
  let active = 0;

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const ticket = new URL(req.url ?? "", "http://localhost").searchParams.get("ticket") ?? "";
    const payload = verifyTestTicket(ticket, deps.hmacSecret);
    if (!payload) {
      ws.send(JSON.stringify({ type: "error", message: "invalid or expired ticket" }));
      ws.close();
      return;
    }
    if (active >= deps.maxSessions) {
      ws.send(JSON.stringify({ type: "error", message: "gateway at capacity" }));
      ws.close();
      return;
    }
    active += 1;
    void runSession(ws, payload, deps).finally(() => {
      active -= 1;
    });
  });

  wss.on("error", (error) => deps.logger?.(`voice gateway error: ${error.message}`));
  deps.logger?.(`voice gateway listening on ws://0.0.0.0:${deps.port}`);
  return wss;
}

async function runSession(
  ws: WebSocket,
  payload: TestTicketPayload,
  deps: VoiceGatewayDeps,
): Promise<void> {
  const serverAudio = deps.serverAudio ?? false;
  const transport = new WebSocketTransport(ws, serverAudio);
  try {
    transport.send({ type: "state", state: "connecting" });
    transport.send({ type: "config", serverAudio });
    const created = await deps.internal.createCall({
      agentId: payload.agentId,
      direction: "INBOUND",
      fromE164: "+998000000000",
      toE164: "+998000000001",
    });
    transport.send({ type: "call", callId: created.callId });
    transport.send({ type: "state", state: "in_call" });

    const session = new CallSession({
      callId: created.callId,
      organizationId: created.organizationId,
      agent: created.agent,
      providers: deps.providers,
      internal: deps.internal,
      transport,
      storage: deps.storage,
      llmModel: deps.llmModel,
      onTranscript: (turn) =>
        transport.send({
          type: "caption",
          role: turn.role === "CALLER" ? "CALLER" : "AGENT",
          text: turn.text,
          language: turn.language.toLowerCase(),
        }),
      logger: deps.logger,
    });
    await session.run();
  } catch (error) {
    deps.logger?.(`gateway session failed: ${error instanceof Error ? error.message : String(error)}`);
    transport.send({ type: "error", message: "session failed" });
  } finally {
    await transport.close();
  }
}
