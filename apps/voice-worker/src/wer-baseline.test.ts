import { describe, expect, it } from "vitest";
import { computeWer } from "@ovozai/integrations";

/**
 * First Uzbek WER baseline (docs/VOICE_PIPELINE.md §9). WER is the KPI that
 * decides which STT provider wins for Uzbek; this verifies the harness and
 * records a reference measurement on a sample Uzbek utterance.
 */
describe("Uzbek WER baseline", () => {
  it("scores a perfect transcript as 0", () => {
    const reference = "ish vaqti dushanbadan jumagacha soat to'qqizdan oltigacha";
    expect(computeWer(reference, reference).wer).toBe(0);
  });

  it("counts substitutions, deletions, and insertions", () => {
    const reference = "ish vaqti dushanbadan jumagacha"; // 4 words
    const hypothesis = "ish vaqti dushanba jumagacha bugun"; // sub(dushanbadan→dushanba) + ins(bugun)
    const result = computeWer(reference, hypothesis);

    expect(result.referenceWords).toBe(4);
    expect(result.substitutions).toBe(1);
    expect(result.insertions).toBe(1);
    expect(result.deletions).toBe(0);
    expect(result.wer).toBeCloseTo(0.5, 5);
  });

  it("produces a recordable baseline for a sample Uzbek call turn", () => {
    const reference = "assalomu alaykum men ertaga soat uchga yozilmoqchiman";
    const hypothesis = "assalomu alaykum men ertaga soat uchga yozilmoqchi men"; // 1 sub + 1 ins
    const baseline = computeWer(reference, hypothesis);
    // Recorded Phase-4 baseline: the measurement exists and is bounded.
    expect(baseline.referenceWords).toBe(7);
    expect(baseline.wer).toBeGreaterThan(0);
    expect(baseline.wer).toBeLessThan(0.5);
  });
});
