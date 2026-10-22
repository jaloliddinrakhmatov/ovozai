/** A chunk of a document ready for embedding. */
export interface TextChunk {
  ordinal: number;
  content: string;
  tokenCount: number;
}

export interface ChunkOptions {
  /** Target maximum characters per chunk. */
  maxChars?: number;
  /** Overlap (characters) when hard-splitting an oversized paragraph. */
  overlapChars?: number;
  /**
   * FAQ mode: keep each paragraph as its own chunk instead of packing several
   * together. Focused, single-topic chunks retrieve far better for Q&A content
   * (a question matches its own answer, not a wall of unrelated items).
   */
  splitParagraphs?: boolean;
}

/** Rough token estimate (~4 chars/token) — good enough for metering/ordering. */
function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Split document text into chunks on paragraph boundaries, greedily packing up
 * to `maxChars` and hard-splitting any single oversized paragraph with overlap.
 * Deterministic and dependency-free.
 */
export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  const maxChars = options.maxChars ?? 1000;
  const overlapChars = options.overlapChars ?? 150;

  const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];

  const paragraphs = clean
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const pieces: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxChars) {
      pieces.push(paragraph);
      continue;
    }
    const step = Math.max(1, maxChars - overlapChars);
    for (let i = 0; i < paragraph.length; i += step) {
      pieces.push(paragraph.slice(i, i + maxChars));
    }
  }

  // FAQ mode keeps each paragraph separate; otherwise greedily pack paragraphs
  // up to maxChars.
  const merged: string[] = [];
  if (options.splitParagraphs) {
    merged.push(...pieces);
  } else {
    let current = "";
    for (const piece of pieces) {
      if (!current) {
        current = piece;
      } else if (current.length + 2 + piece.length <= maxChars) {
        current = `${current}\n\n${piece}`;
      } else {
        merged.push(current);
        current = piece;
      }
    }
    if (current) merged.push(current);
  }

  return merged.map((content, ordinal) => ({ ordinal, content, tokenCount: estimateTokens(content) }));
}
