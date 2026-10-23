import { describe, expect, it } from "vitest";
import type { AudioChunk } from "@ovozai/integrations";
import { LiveKitTransport, type InboundFrame, type MediaIO } from "./livekit-transport";
import { int16ToWav } from "./audio";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A push-driven async iterable for feeding caller frames on demand. */
function pushable<T>() {
  const buf: T[] = [];
  let resolve: ((r: IteratorResult<T>) => void) | null = null;
  let done = false;
  const iterable: AsyncIterable<T> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<T>> {
          if (buf.length) return Promise.resolve({ value: buf.shift() as T, done: false });
          if (done) return Promise.resolve({ value: undefined as never, done: true });
          return new Promise((r) => {
            resolve = r;
          });
        },
      };
    },
  };
  return {
    iterable,
    push(v: T) {
      if (resolve) {
        const r = resolve;
        resolve = null;
        r({ value: v, done: false });
      } else buf.push(v);
    },
    end() {
      done = true;
      if (resolve) {
        const r = resolve;
        resolve = null;
        r({ value: undefined as never, done: true });
      }
    },
  };
}

function mockIO(sampleRate = 16000) {
  const stream = pushable<InboundFrame>();
  const captured: Int16Array[] = [];
  const io: MediaIO = {
    inbound: stream.iterable,
    outboundSampleRate: 48000,
    capture: (f) => {
      captured.push(f);
    },
    close: () => {},
  };
  const speech = (samples = 320) => {
    const p = new Int16Array(samples);
    for (let i = 0; i < samples; i += 1) p[i] = Math.round(Math.sin(i * 0.2) * 9000);
    return { data: p, sampleRate };
  };
  const silence = (samples = 320): InboundFrame => ({ data: new Int16Array(samples), sampleRate });
  return { io, captured, stream, speech, silence };
}

describe("LiveKitTransport", () => {
  it("segments a caller utterance (speech → silence) into a WAV turn", async () => {
    const m = mockIO();
    const t = new LiveKitTransport(m.io, { sttSampleRate: 16000 });
    for (let i = 0; i < 20; i += 1) m.stream.push(m.speech()); // ~400ms speech (> minSpeechMs)
    for (let i = 0; i < 40; i += 1) m.stream.push(m.silence()); // >700ms silence closes it

    const turn = await t.nextCallerTurn();
    expect(turn).not.toBeNull();
    const chunks: AudioChunk[] = [];
    for await (const c of turn!.audio) chunks.push(c);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.encoding).toBe("wav");
    expect(new TextDecoder().decode(chunks[0]!.data.slice(0, 4))).toBe("RIFF");

    m.stream.end();
    expect(await t.nextCallerTurn()).toBeNull(); // hangup
  });

  it("plays agent audio by capturing outbound PCM frames", async () => {
    const m = mockIO();
    const t = new LiveKitTransport(m.io, { frameMs: 20 });
    const wav = int16ToWav(Int16Array.from({ length: 4800 }, (_, i) => Math.round(Math.sin(i) * 5000)), 48000);
    const audio = (async function* () {
      yield { data: wav, sampleRate: 48000, encoding: "wav" } as AudioChunk;
    })();
    const result = await t.playAgentAudio(audio, new AbortController());
    expect(result.bargedIn).toBe(false);
    // 4800 samples @ 48k in 20ms (960-sample) frames → ~5 frames.
    expect(m.captured.length).toBeGreaterThanOrEqual(5);
  });

  it("barges in: caller speech during playback aborts the agent", async () => {
    const m = mockIO();
    const t = new LiveKitTransport(m.io, { frameMs: 20 });
    const controller = new AbortController();
    // A long TTS stream, paced so speech can interrupt it.
    const audio = (async function* () {
      for (let i = 0; i < 30; i += 1) {
        await delay(5);
        yield {
          data: int16ToWav(new Int16Array(2400), 48000),
          sampleRate: 48000,
          encoding: "wav",
        } as AudioChunk;
      }
    })();
    const play = t.playAgentAudio(audio, controller);
    await delay(15);
    for (let i = 0; i < 8; i += 1) m.stream.push(m.speech()); // caller interrupts
    const result = await play;
    expect(result.bargedIn).toBe(true);
    expect(controller.signal.aborted).toBe(true);
  });
});
