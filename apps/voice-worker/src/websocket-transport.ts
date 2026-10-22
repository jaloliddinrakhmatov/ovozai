import { audioToText, textToAudio, type AudioChunk } from "@ovozai/integrations";
import type { VoiceClientMessage, VoiceServerMessage } from "@ovozai/contracts";
import type { WebSocket } from "ws";
import type { AudioTransport, CallerTurn, PlaybackResult } from "./transport";

/**
 * Live media transport over a browser WebSocket (the "Test Agent" path). It
 * implements the same `AudioTransport` contract as the simulated/LiveKit
 * transports, so the orchestrator (`CallSession`) is unchanged.
 *
 * Current protocol (dev-bridge verifiable): the browser sends `caller_text` turns
 * (type-to-talk) which are wrapped as dev-bridge audio for the STT provider; the
 * worker streams back captions + the agent's spoken text. Real microphone audio
 * frames become meaningful once a real streaming STT provider is configured
 * (docs/MULTILINGUAL_EVALUATION.md) — the message contract already reserves the
 * audio/barge-in paths.
 */
export class WebSocketTransport implements AudioTransport {
  private readonly queue: CallerTurn[] = [];
  private waiter: ((turn: CallerTurn | null) => void) | null = null;
  private closed = false;
  private bargeRequested = false;

  constructor(private readonly ws: WebSocket) {
    ws.on("message", (raw: unknown) => this.onMessage(raw));
    ws.on("close", () => this.finish());
    ws.on("error", () => this.finish());
  }

  send(message: VoiceServerMessage): void {
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private onMessage(raw: unknown): void {
    let message: VoiceClientMessage;
    try {
      message = JSON.parse(String(raw)) as VoiceClientMessage;
    } catch {
      return;
    }
    switch (message.type) {
      case "caller_text": {
        const text = (message.text ?? "").toString().trim();
        if (!text) return;
        this.send({ type: "caption", role: "CALLER", text, language: message.language });
        this.enqueue({ audio: this.oneUtterance(text), language: message.language });
        return;
      }
      case "barge_in":
        this.bargeRequested = true;
        return;
      case "hangup":
        this.finish();
        return;
      default:
        return;
    }
  }

  private enqueue(turn: CallerTurn): void {
    if (this.waiter) {
      const resolve = this.waiter;
      this.waiter = null;
      resolve(turn);
    } else {
      this.queue.push(turn);
    }
  }

  private finish(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.waiter) {
      const resolve = this.waiter;
      this.waiter = null;
      resolve(null);
    }
  }

  private async *oneUtterance(text: string): AsyncIterable<AudioChunk> {
    yield textToAudio(text);
  }

  async nextCallerTurn(): Promise<CallerTurn | null> {
    const queued = this.queue.shift();
    if (queued) return queued;
    if (this.closed) return null;
    return new Promise<CallerTurn | null>((resolve) => {
      this.waiter = resolve;
    });
  }

  async playAgentAudio(
    audio: AsyncIterable<AudioChunk>,
    controller: AbortController,
  ): Promise<PlaybackResult> {
    this.bargeRequested = false;
    const parts: string[] = [];
    let bargedIn = false;
    for await (const chunk of audio) {
      if (this.bargeRequested) {
        controller.abort();
        bargedIn = true;
        break;
      }
      parts.push(audioToText(chunk));
    }
    const text = parts.join("").trim();
    if (text) {
      this.send({ type: "caption", role: "AGENT", text });
      this.send({ type: "agent_audio_text", text });
    }
    return { bargedIn };
  }

  async close(): Promise<void> {
    this.send({ type: "state", state: "ended" });
    try {
      this.ws.close();
    } catch {
      /* already closing */
    }
  }
}
