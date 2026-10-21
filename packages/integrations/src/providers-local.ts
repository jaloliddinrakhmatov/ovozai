import type { AudioChunk } from "./types";
import type { SttOptions, SttProvider, SttResult } from "./stt";
import type { LlmCompletionOptions, LlmProvider, LlmStreamChunk } from "./llm";
import type { TtsOptions, TtsProvider } from "./tts";

/**
 * DEV BRIDGE — not real audio. The local providers carry spoken text as UTF-8
 * bytes inside an `AudioChunk` so the full STT→LLM→TTS loop (and the voice-worker
 * orchestrator) can be driven and verified without real audio or provider keys.
 * Real audio goes through the OpenAI (or other) adapters instead.
 */
const BRIDGE_SAMPLE_RATE = 16000;

export function textToAudio(text: string): AudioChunk {
  return { data: new TextEncoder().encode(text), sampleRate: BRIDGE_SAMPLE_RATE, encoding: "pcm16" };
}

export function audioToText(chunk: AudioChunk): string {
  return new TextDecoder().decode(chunk.data);
}

async function collectText(text: AsyncIterable<string> | string): Promise<string> {
  if (typeof text === "string") return text;
  let full = "";
  for await (const part of text) full += part;
  return full;
}

/** Local STT: decodes the dev-bridge audio back to text. */
export class LocalSttProvider implements SttProvider {
  readonly name = "local-echo-stt";

  async *transcribe(audio: AsyncIterable<AudioChunk>, options: SttOptions): AsyncIterable<SttResult> {
    const language = options.languages[0] ?? "uz";
    let full = "";
    for await (const chunk of audio) {
      full += audioToText(chunk);
      yield { transcript: full.trim(), isFinal: false, detectedLanguage: language };
    }
    yield { transcript: full.trim(), isFinal: true, confidence: 1, detectedLanguage: language };
  }
}

/**
 * Local deterministic, rule-based LLM stand-in (NOT a real model). It exercises
 * the real streaming + tool-calling contract: a caller question triggers a
 * `knowledge_retrieval` tool call, then (given the tool result back) it answers
 * from that result; booking intent triggers `book_appointment`; a goodbye
 * triggers `end_call`. Swap in {@link OpenAiLlmProvider} for a real model.
 */
export class LocalRuleLlmProvider implements LlmProvider {
  readonly name = "local-rule-llm";

  async *complete(options: LlmCompletionOptions): AsyncIterable<LlmStreamChunk> {
    const messages = options.messages;
    const last = messages[messages.length - 1];
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userText = lastUser?.content ?? "";

    // If the previous step returned a tool result, answer from it.
    if (last?.role === "tool") {
      const answer = last.content.trim() || "I'm sorry, I don't have that information right now.";
      yield* this.streamWords(answer);
      yield { done: true };
      return;
    }

    const lower = userText.toLowerCase();
    if (/\b(bye|goodbye|thanks|thank you|rahmat|xayr|спасибо|до свидания)\b/u.test(lower)) {
      yield {
        toolCall: {
          id: "call_end",
          name: "end_call",
          argumentsDelta: JSON.stringify({ reason: "caller ended", disposition: "completed" }),
        },
        done: false,
      };
      yield { done: true };
      return;
    }

    if (/\b(book|appointment|reserve|schedule|band|yozil|запис|прием|appointment)\b/u.test(lower)) {
      const startsAt = new Date(Date.now() + 86_400_000).toISOString();
      yield {
        toolCall: {
          id: "call_book",
          name: "book_appointment",
          argumentsDelta: JSON.stringify({ title: "Appointment", startsAt }),
        },
        done: false,
      };
      yield { done: true };
      return;
    }

    // Default: retrieve from the knowledge base to answer the question.
    yield {
      toolCall: {
        id: "call_kr",
        name: "knowledge_retrieval",
        argumentsDelta: JSON.stringify({ query: userText }),
      },
      done: false,
    };
    yield { done: true };
  }

  private async *streamWords(text: string): AsyncIterable<LlmStreamChunk> {
    const words = text.split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i += 1) {
      yield { textDelta: i === 0 ? words[i]! : ` ${words[i]!}`, done: false };
    }
  }
}

/** Local TTS: emits the dev-bridge audio word-by-word, cancellable for barge-in. */
export class LocalTtsProvider implements TtsProvider {
  readonly name = "local-echo-tts";

  async *synthesize(
    text: AsyncIterable<string> | string,
    _options: TtsOptions,
    signal?: AbortSignal,
  ): AsyncIterable<AudioChunk> {
    const full = await collectText(text);
    const words = full.split(/\s+/).filter(Boolean);
    for (const word of words) {
      if (signal?.aborted) return; // barge-in: stop emitting immediately
      yield textToAudio(`${word} `);
      await Promise.resolve();
    }
  }
}
