/** Word Error Rate measurement (docs/VOICE_PIPELINE.md §9) — the KPI for Uzbek STT. */

export interface WerResult {
  /** Word Error Rate = (S + D + I) / N_ref. 0 is perfect; can exceed 1. */
  wer: number;
  substitutions: number;
  deletions: number;
  insertions: number;
  /** Number of reference words. */
  referenceWords: number;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Compute WER between a reference (ground-truth) and hypothesis (ASR output)
 * transcript via word-level Levenshtein alignment with backtrace.
 */
export function computeWer(reference: string, hypothesis: string): WerResult {
  const ref = tokenize(reference);
  const hyp = tokenize(hypothesis);
  const n = ref.length;
  const m = hyp.length;

  // dp[i][j] = min edits aligning ref[0..i) with hyp[0..j).
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 0; i <= n; i += 1) dp[i]![0] = i;
  for (let j = 0; j <= m; j += 1) dp[0]![j] = j;
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }

  // Backtrace to count S / D / I.
  let i = n;
  let j = m;
  let substitutions = 0;
  let deletions = 0;
  let insertions = 0;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && ref[i - 1] === hyp[j - 1] && dp[i]![j] === dp[i - 1]![j - 1]) {
      i -= 1;
      j -= 1;
    } else if (i > 0 && j > 0 && dp[i]![j] === dp[i - 1]![j - 1]! + 1) {
      substitutions += 1;
      i -= 1;
      j -= 1;
    } else if (i > 0 && dp[i]![j] === dp[i - 1]![j]! + 1) {
      deletions += 1;
      i -= 1;
    } else {
      insertions += 1;
      j -= 1;
    }
  }

  const wer = n === 0 ? (m === 0 ? 0 : 1) : (substitutions + deletions + insertions) / n;
  return { wer, substitutions, deletions, insertions, referenceWords: n };
}
