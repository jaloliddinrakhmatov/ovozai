import { textToAudio, type AudioChunk } from "@ovozai/integrations";
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

  constructor(
    private readonly ws: WebSocket,
    /** When true, the agent's synthesized audio (e.g. NeuronAI WAV) is forwarded
     *  to the browser to play; otherwise the browser speaks the text itself. */
    private readonly serverAudio = false,
  ) {
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
        // Caption is emitted from the session's transcript callback (so it is
        // provider-agnostic). Pass the text through directly (skip server STT),
        // still providing dev-bridge audio for providers that expect a stream.
        this.enqueue({ audio: this.oneUtterance(text), language: message.language, text });
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
    const chunks: Uint8Array[] = [];
    let bargedIn = false;
    for await (const chunk of audio) {
      if (this.bargeRequested) {
        controller.abort();
        bargedIn = true;
        break;
      }
      chunks.push(chunk.data);
    }
    if (bargedIn || chunks.length === 0) return { bargedIn };

    if (this.serverAudio) {
      // Real synthesized audio (e.g. NeuronAI WAV) → play in the browser.
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.length;
      }
      this.send({ type: "agent_audio", mime: "audio/wav", dataBase64: Buffer.from(merged).toString("base64") });
    } else {
      // Dev-bridge: the "audio" carries the spoken text; the browser speaks it.
      const text = chunks.map((c) => new TextDecoder().decode(c)).join("").trim();
      if (text) this.send({ type: "agent_audio_text", text });
    }
    return { bargedIn };
  }

  speakTextFallback(text: string): void {
    if (text.trim()) this.send({ type: "agent_audio_text", text });
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
