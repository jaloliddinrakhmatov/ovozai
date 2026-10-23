import type { AudioChunk } from "@ovozai/integrations";
import type { AudioTransport, CallerTurn, PlaybackResult } from "./transport";
import { int16ToWav, pcmFromAudioChunk, resampleInt16, VadSegmenter } from "./audio";

/**
 * Live media transport over LiveKit (docs/VOICE_PIPELINE.md §1, §4.1).
 *
 * `CallSession` is transport-agnostic; this plugs the real media plane in. It
 * works against a minimal {@link MediaIO} (continuous caller PCM in, caller PCM
 * out) that the LiveKit runner adapts from `@livekit/rtc-node` — so the hard
 * parts (VAD segmentation + barge-in) are plain and unit-testable without a
 * LiveKit server.
 */

export interface InboundFrame {
  data: Int16Array;
  sampleRate: number;
}

export interface MediaIO {
  /** Continuous PCM frames from the caller; the iterator ends on hangup. */
  inbound: AsyncIterable<InboundFrame>;
  /** Sample rate the outbound sink expects. */
  outboundSampleRate: number;
  /** Push one PCM frame (at `outboundSampleRate`) to the caller; awaits backpressure. */
  capture(frame: Int16Array): void | Promise<void>;
  close(): void | Promise<void>;
}

export interface LiveKitTransportOptions {
  /** Sample rate STT audio is produced at (16 kHz is ideal for ASR). */
  sttSampleRate?: number;
  /** Outbound frame size in milliseconds (pacing granularity for barge-in). */
  frameMs?: number;
}

export class LiveKitTransport implements AudioTransport {
  private readonly sttRate: number;
  private readonly frameMs: number;
  private readonly vad: VadSegmenter;
  private readonly queue: Int16Array[] = [];
  private waiter: ((turn: CallerTurn | null) => void) | null = null;
  private ended = false;
  /** Set while the agent is speaking so the read loop can trigger barge-in. */
  private playback: AbortController | null = null;

  constructor(
    private readonly io: MediaIO,
    opts: LiveKitTransportOptions = {},
  ) {
    this.sttRate = opts.sttSampleRate ?? 16000;
    this.frameMs = opts.frameMs ?? 20;
    this.vad = new VadSegmenter({ sampleRate: this.sttRate });
    void this.readLoop();
  }

  private async readLoop(): Promise<void> {
    try {
      for await (const frame of this.io.inbound) {
        const pcm = resampleInt16(frame.data, frame.sampleRate, this.sttRate);
        const utterance = this.vad.push(pcm);
        // Barge-in: the caller started talking while the agent was speaking.
        if (this.vad.speaking && this.playback && !this.playback.signal.aborted) {
          this.playback.abort();
        }
        if (utterance) this.enqueue(utterance);
      }
    } catch {
      /* stream errored → treat as hangup */
    } finally {
      const tail = this.vad.flush();
      if (tail) this.enqueue(tail);
      this.ended = true;
      if (this.waiter) {
        this.waiter(null);
        this.waiter = null;
      }
    }
  }

  private enqueue(pcm: Int16Array): void {
    if (this.waiter) {
      const resolve = this.waiter;
      this.waiter = null;
      resolve(this.toTurn(pcm));
    } else {
      this.queue.push(pcm);
    }
  }

  private toTurn(pcm: Int16Array): CallerTurn {
    const rate = this.sttRate;
    const audio = (async function* (): AsyncIterable<AudioChunk> {
      yield { data: int16ToWav(pcm, rate), sampleRate: rate, encoding: "wav" };
    })();
    return { audio };
  }

  async nextCallerTurn(): Promise<CallerTurn | null> {
    const pcm = this.queue.shift();
    if (pcm) return this.toTurn(pcm);
    if (this.ended) return null;
    return new Promise<CallerTurn | null>((resolve) => {
      this.waiter = resolve;
    });
  }

  async playAgentAudio(
    audio: AsyncIterable<AudioChunk>,
    controller: AbortController,
  ): Promise<PlaybackResult> {
    this.playback = controller;
    const frameSamples = Math.max(1, Math.round((this.io.outboundSampleRate * this.frameMs) / 1000));
    let bargedIn = false;
    try {
      for await (const chunk of audio) {
        if (controller.signal.aborted) {
          bargedIn = true;
          break;
        }
        const pcm = pcmFromAudioChunk(chunk, this.io.outboundSampleRate);
        for (let off = 0; off < pcm.length; off += frameSamples) {
          if (controller.signal.aborted) {
            bargedIn = true;
            break;
          }
          await this.io.capture(pcm.subarray(off, Math.min(off + frameSamples, pcm.length)));
        }
        if (bargedIn) break;
      }
    } finally {
      this.playback = null;
    }
    return { bargedIn };
  }

  async close(): Promise<void> {
    await this.io.close();
  }
}
