import type { AudioChunk } from "./types";
import type { SttOptions, SttProvider, SttResult } from "./stt";
import type { LlmCompletionOptions, LlmProvider, LlmStreamChunk } from "./llm";
import type { TtsOptions, TtsProvider } from "./tts";

/**
 * OpenAI-compatible real adapters (require an API key). These are the concrete
 * "one provider each" for Phase 4; they are NOT exercised in this environment
 * (no key), but are wired so a deployment can swap them in via config. STT/TTS
 * are non-streaming for the MVP (buffer → one request); the LLM streams.
 */
export interface OpenAiConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

function baseUrlOf(config: OpenAiConfig): string {
  return (config.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
}

export class OpenAiLlmProvider implements LlmProvider {
  readonly name = "openai-llm";
  constructor(private readonly config: OpenAiConfig) {}

  async *complete(options: LlmCompletionOptions): AsyncIterable<LlmStreamChunk> {
    const body = {
      model: options.model || this.config.model || "gpt-4o-mini",
      stream: true,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      messages: options.messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
      })),
      ...(options.tools
        ? {
            tools: options.tools.map((t) => ({
              type: "function",
              function: { name: t.name, description: t.description, parameters: t.parameters },
            })),
          }
        : {}),
    };

    const response = await fetch(`${baseUrlOf(this.config)}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.config.apiKey}` },
      body: JSON.stringify(body),
    });
    if (!response.ok || !response.body) {
      throw new Error(`OpenAI LLM error ${response.status}: ${await response.text()}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") {
          yield { done: true };
          return;
        }
        const parsed = JSON.parse(data) as {
          choices?: Array<{
            delta?: {
              content?: string;
              tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
            };
            finish_reason?: string | null;
          }>;
        };
        const choice = parsed.choices?.[0];
        const delta = choice?.delta;
        if (delta?.content) {
          yield { textDelta: delta.content, done: false };
        }
        const toolCall = delta?.tool_calls?.[0];
        if (toolCall) {
          yield {
            toolCall: {
              id: toolCall.id ?? "call_0",
              name: toolCall.function?.name ?? "",
              argumentsDelta: toolCall.function?.arguments ?? "",
            },
            done: false,
          };
        }
      }
    }
    yield { done: true };
  }
}

export class OpenAiSttProvider implements SttProvider {
  readonly name = "openai-stt";
  constructor(private readonly config: OpenAiConfig) {}

  async *transcribe(audio: AsyncIterable<AudioChunk>, options: SttOptions): AsyncIterable<SttResult> {
    const parts: Uint8Array[] = [];
    for await (const chunk of audio) parts.push(chunk.data);
    const blob = new Blob(parts, { type: "audio/wav" });

    const form = new FormData();
    form.set("file", blob, "audio.wav");
    form.set("model", this.config.model ?? "whisper-1");
    const language = options.languages[0];
    if (language) form.set("language", language);

    const response = await fetch(`${baseUrlOf(this.config)}/audio/transcriptions`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.config.apiKey}` },
      body: form,
    });
    if (!response.ok) {
      throw new Error(`OpenAI STT error ${response.status}: ${await response.text()}`);
    }
    const json = (await response.json()) as { text: string };
    yield { transcript: json.text.trim(), isFinal: true, confidence: 1, detectedLanguage: language };
  }
}

export class OpenAiTtsProvider implements TtsProvider {
  readonly name = "openai-tts";
  constructor(private readonly config: OpenAiConfig) {}

  async *synthesize(
    text: AsyncIterable<string> | string,
    options: TtsOptions,
    signal?: AbortSignal,
  ): AsyncIterable<AudioChunk> {
    let input = "";
    if (typeof text === "string") input = text;
    else for await (const part of text) input += part;

    const response = await fetch(`${baseUrlOf(this.config)}/audio/speech`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.config.apiKey}` },
      body: JSON.stringify({
        model: this.config.model ?? "tts-1",
        voice: options.voiceId || "alloy",
        input,
        response_format: "opus",
      }),
      signal,
    });
    if (!response.ok) {
      throw new Error(`OpenAI TTS error ${response.status}: ${await response.text()}`);
    }
    const buffer = new Uint8Array(await response.arrayBuffer());
    yield { data: buffer, sampleRate: 48_000, encoding: "opus" };
  }
}
