import type { AudioChunk } from "@ovozai/integrations";

/**
 * Dependency-free audio DSP for the real-media (LiveKit/SIP) path: convert
 * between int16 PCM and WAV, resample, and detect speech energy. Pure functions
 * (unit-tested in audio.test.ts) so the media transport logic stays verifiable
 * without a LiveKit server.
 */

/** Little-endian int16 PCM → a mono WAV file (so Whisper-style STT can read it). */
export function int16ToWav(pcm: Int16Array, sampleRate: number): Uint8Array {
  const dataBytes = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // audio format = PCM
  view.setUint16(22, 1, true); // channels = mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataBytes, true);
  let offset = 44;
  for (let i = 0; i < pcm.length; i += 1, offset += 2) view.setInt16(offset, pcm[i]!, true);
  return new Uint8Array(buffer);
}

/** Parse a mono/stereo PCM WAV back into int16 samples (first channel) + its rate. */
export function wavToInt16(bytes: Uint8Array): { pcm: Int16Array; sampleRate: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const readStr = (offset: number, len: number) => {
    let s = "";
    for (let i = 0; i < len; i += 1) s += String.fromCharCode(view.getUint8(offset + i));
    return s;
  };
  if (bytes.byteLength < 12 || readStr(0, 4) !== "RIFF" || readStr(8, 4) !== "WAVE") {
    // Not a WAV container — treat the whole thing as raw 16k PCM.
    return { pcm: bytesToInt16(bytes), sampleRate: 16000 };
  }
  let sampleRate = 16000;
  let channels = 1;
  let offset = 12;
  let dataOffset = -1;
  let dataLen = 0;
  while (offset + 8 <= bytes.byteLength) {
    const id = readStr(offset, 4);
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt ") {
      channels = view.getUint16(offset + 10, true) || 1;
      sampleRate = view.getUint32(offset + 12, true) || 16000;
    } else if (id === "data") {
      dataOffset = offset + 8;
      dataLen = size;
      break;
    }
    offset += 8 + size + (size % 2); // chunks are word-aligned
  }
  if (dataOffset < 0) return { pcm: new Int16Array(0), sampleRate };
  const total = Math.floor(Math.min(dataLen, bytes.byteLength - dataOffset) / 2);
  const all = new Int16Array(total);
  for (let i = 0; i < total; i += 1) all[i] = view.getInt16(dataOffset + i * 2, true);
  if (channels <= 1) return { pcm: all, sampleRate };
  // Downmix to mono by taking the first channel.
  const mono = new Int16Array(Math.floor(all.length / channels));
  for (let i = 0; i < mono.length; i += 1) mono[i] = all[i * channels]!;
  return { pcm: mono, sampleRate };
}

/** Raw little-endian int16 bytes → Int16Array. */
export function bytesToInt16(bytes: Uint8Array): Int16Array {
  const n = Math.floor(bytes.byteLength / 2);
  const out = new Int16Array(n);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < n; i += 1) out[i] = view.getInt16(i * 2, true);
  return out;
}

/** Int16Array → little-endian bytes. */
export function int16ToBytes(pcm: Int16Array): Uint8Array {
  const out = new Uint8Array(pcm.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < pcm.length; i += 1) view.setInt16(i * 2, pcm[i]!, true);
  return out;
}

/** Linear-interpolation resampler between two sample rates. */
export function resampleInt16(pcm: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate || pcm.length === 0) return pcm;
  const ratio = toRate / fromRate;
  const outLen = Math.max(1, Math.round(pcm.length * ratio));
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i += 1) {
    const src = i / ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, pcm.length - 1);
    const frac = src - i0;
    out[i] = Math.round((pcm[i0] ?? 0) * (1 - frac) + (pcm[i1] ?? 0) * frac);
  }
  return out;
}

/** RMS energy of a frame, normalized to 0..1 (1 = full-scale). */
export function rms(pcm: Int16Array): number {
  if (pcm.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < pcm.length; i += 1) {
    const s = pcm[i]! / 32768;
    sum += s * s;
  }
  return Math.sqrt(sum / pcm.length);
}

/** Decode any TTS {@link AudioChunk} to int16 PCM at `targetRate`. */
export function pcmFromAudioChunk(chunk: AudioChunk, targetRate: number): Int16Array {
  let pcm: Int16Array;
  let rate: number;
  if (chunk.encoding === "wav") {
    const decoded = wavToInt16(chunk.data);
    pcm = decoded.pcm;
    rate = decoded.sampleRate;
  } else if (chunk.encoding === "pcm16") {
    pcm = bytesToInt16(chunk.data);
    rate = chunk.sampleRate;
  } else {
    // opus / mulaw need a codec we don't bundle — caller should use wav/pcm16
    // TTS for the phone path (NeuronAI WAV works out of the box).
    throw new Error(`Cannot convert ${chunk.encoding} audio to PCM without a decoder`);
  }
  return resampleInt16(pcm, rate, targetRate);
}

/**
 * Energy-based voice-activity segmenter. Feed it fixed-size PCM frames; it
 * emits a complete utterance (as one Int16Array) once speech is followed by
 * `silenceMs` of quiet. Good enough to turn a continuous caller stream into
 * utterances for STT; a neural VAD can replace it later behind the same API.
 */
export interface VadOptions {
  sampleRate: number;
  /** RMS threshold above which a frame counts as speech (0..1). */
  threshold?: number;
  /** Trailing silence that ends an utterance. */
  silenceMs?: number;
  /** Minimum speech to treat a segment as a real utterance (drops blips). */
  minSpeechMs?: number;
}

export class VadSegmenter {
  private readonly threshold: number;
  private readonly silenceMs: number;
  private readonly minSpeechMs: number;
  private readonly sampleRate: number;
  private buffer: number[] = [];
  private speechMs = 0;
  private silenceRun = 0;
  private inSpeech = false;

  constructor(opts: VadOptions) {
    this.sampleRate = opts.sampleRate;
    this.threshold = opts.threshold ?? 0.012;
    this.silenceMs = opts.silenceMs ?? 700;
    this.minSpeechMs = opts.minSpeechMs ?? 250;
  }

  /** True while the caller is currently speaking (for barge-in detection). */
  get speaking(): boolean {
    return this.inSpeech;
  }

  /** Feed a frame; returns a finished utterance's PCM when one completes. */
  push(frame: Int16Array): Int16Array | null {
    const frameMs = (frame.length / this.sampleRate) * 1000;
    const loud = rms(frame) >= this.threshold;
    if (loud) {
      this.inSpeech = true;
      this.silenceRun = 0;
      this.speechMs += frameMs;
      for (let i = 0; i < frame.length; i += 1) this.buffer.push(frame[i]!);
      return null;
    }
    if (this.inSpeech) {
      // Keep a little trailing audio for natural endings.
      for (let i = 0; i < frame.length; i += 1) this.buffer.push(frame[i]!);
      this.silenceRun += frameMs;
      if (this.silenceRun >= this.silenceMs) {
        const utterance = this.speechMs >= this.minSpeechMs ? Int16Array.from(this.buffer) : null;
        this.reset();
        return utterance;
      }
    }
    return null;
  }

  /** Flush any buffered speech (e.g. on hangup). */
  flush(): Int16Array | null {
    const utterance = this.inSpeech && this.speechMs >= this.minSpeechMs ? Int16Array.from(this.buffer) : null;
    this.reset();
    return utterance;
  }

  private reset(): void {
    this.buffer = [];
    this.speechMs = 0;
    this.silenceRun = 0;
    this.inSpeech = false;
  }
}
