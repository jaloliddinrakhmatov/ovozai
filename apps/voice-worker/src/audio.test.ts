import { describe, expect, it } from "vitest";
import {
  bytesToInt16,
  int16ToBytes,
  int16ToWav,
  pcmFromAudioChunk,
  resampleInt16,
  rms,
  VadSegmenter,
  wavToInt16,
} from "./audio";

function tone(samples: number, amp = 8000): Int16Array {
  const pcm = new Int16Array(samples);
  for (let i = 0; i < samples; i += 1) pcm[i] = Math.round(Math.sin(i * 0.2) * amp);
  return pcm;
}

describe("audio DSP", () => {
  it("int16 ↔ WAV round-trips the samples and rate", () => {
    const pcm = tone(1000);
    const wav = int16ToWav(pcm, 16000);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF");
    const back = wavToInt16(wav);
    expect(back.sampleRate).toBe(16000);
    expect(back.pcm.length).toBe(1000);
    expect(Array.from(back.pcm.slice(0, 5))).toEqual(Array.from(pcm.slice(0, 5)));
  });

  it("int16 ↔ bytes round-trips", () => {
    const pcm = Int16Array.from([0, 1, -1, 32767, -32768, 1234]);
    expect(Array.from(bytesToInt16(int16ToBytes(pcm)))).toEqual(Array.from(pcm));
  });

  it("resample changes length by the rate ratio", () => {
    const pcm = tone(1000);
    expect(resampleInt16(pcm, 48000, 16000).length).toBe(333);
    expect(resampleInt16(pcm, 16000, 48000).length).toBe(3000);
    expect(resampleInt16(pcm, 16000, 16000)).toBe(pcm); // no-op
  });

  it("rms is ~0 for silence and higher for a tone", () => {
    expect(rms(new Int16Array(500))).toBe(0);
    expect(rms(tone(500))).toBeGreaterThan(0.1);
  });

  it("pcmFromAudioChunk decodes wav and pcm16 to the target rate", () => {
    const pcm = tone(1000);
    const fromWav = pcmFromAudioChunk({ data: int16ToWav(pcm, 24000), sampleRate: 24000, encoding: "wav" }, 48000);
    expect(fromWav.length).toBe(2000); // 24k → 48k doubles
    const fromPcm = pcmFromAudioChunk({ data: int16ToBytes(pcm), sampleRate: 16000, encoding: "pcm16" }, 16000);
    expect(fromPcm.length).toBe(1000);
  });

  it("pcmFromAudioChunk rejects codecs it can't decode", () => {
    expect(() => pcmFromAudioChunk({ data: new Uint8Array(4), sampleRate: 48000, encoding: "opus" }, 48000)).toThrow();
  });

  it("VadSegmenter emits an utterance after speech then silence", () => {
    const sampleRate = 16000;
    const frame = 320; // 20ms
    const vad = new VadSegmenter({ sampleRate, silenceMs: 100, minSpeechMs: 40 });
    let utterance: Int16Array | null = null;

    // ~120ms of speech
    for (let i = 0; i < 6; i += 1) expect(vad.push(tone(frame))).toBeNull();
    expect(vad.speaking).toBe(true);
    // silence frames until it closes the utterance (100ms = 5 frames)
    for (let i = 0; i < 6 && !utterance; i += 1) utterance = vad.push(new Int16Array(frame));
    expect(utterance).not.toBeNull();
    expect(utterance!.length).toBeGreaterThan(frame * 5);
    expect(vad.speaking).toBe(false);
  });

  it("VadSegmenter drops blips shorter than minSpeechMs", () => {
    const vad = new VadSegmenter({ sampleRate: 16000, silenceMs: 60, minSpeechMs: 300 });
    vad.push(tone(320)); // 20ms blip
    let out: Int16Array | null = null;
    for (let i = 0; i < 5 && !out; i += 1) out = vad.push(new Int16Array(320));
    expect(out).toBeNull(); // too short to count
  });
});
