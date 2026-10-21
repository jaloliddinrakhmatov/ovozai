import { audioToText, textToAudio, type AudioChunk } from "@ovozai/integrations";

export interface CallerTurn {
  audio: AsyncIterable<AudioChunk>;
  language?: string;
}

export interface PlaybackResult {
  bargedIn: boolean;
}

/**
 * Abstracts the media plane. The real LiveKit transport (see livekit-transport.ts)
 * subscribes to the caller track and publishes a synthesized track; the simulated
 * transport (below) drives a scripted conversation so the full orchestrator can be
 * verified without a LiveKit server or real audio.
 */
export interface AudioTransport {
  /** Next caller utterance, or null when the caller has hung up. */
  nextCallerTurn(): Promise<CallerTurn | null>;
  /**
   * Play the agent's audio to the caller. The caller may barge in: the transport
   * aborts `controller` and resolves with `bargedIn: true`, stopping synthesis.
   */
  playAgentAudio(audio: AsyncIterable<AudioChunk>, controller: AbortController): Promise<PlaybackResult>;
  close(): Promise<void>;
}

export interface SimulatedCallerUtterance {
  text: string;
  language?: string;
  /** Simulate caller barge-in: abort agent playback after this many audio chunks. */
  bargeInAfterChunks?: number;
}

/** A scripted, in-memory transport for development and tests (no real audio). */
export class SimulatedTransport implements AudioTransport {
  private index = 0;
  private pendingBargeIn: number | undefined;
  /** Decoded text of everything the agent "spoke" (for assertions). */
  readonly spokenText: string[] = [];

  constructor(private readonly script: SimulatedCallerUtterance[]) {}

  async nextCallerTurn(): Promise<CallerTurn | null> {
    const utterance = this.script[this.index];
    if (!utterance) return null;
    this.index += 1;
    this.pendingBargeIn = utterance.bargeInAfterChunks;
    return { audio: this.utteranceAudio(utterance.text), language: utterance.language };
  }

  private async *utteranceAudio(text: string): AsyncIterable<AudioChunk> {
    yield textToAudio(text);
  }

  async playAgentAudio(
    audio: AsyncIterable<AudioChunk>,
    controller: AbortController,
  ): Promise<PlaybackResult> {
    const bargeAt = this.pendingBargeIn;
    let chunks = 0;
    let bargedIn = false;
    const words: string[] = [];
    for await (const chunk of audio) {
      chunks += 1;
      words.push(audioToText(chunk));
      if (bargeAt !== undefined && chunks >= bargeAt) {
        controller.abort();
        bargedIn = true;
        break;
      }
    }
    this.spokenText.push(words.join("").trim());
    return { bargedIn };
  }

  async close(): Promise<void> {
    /* nothing to release */
  }
}
