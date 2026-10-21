import type { ProviderConfig } from "./types";

export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Present on tool-result messages. */
  toolCallId?: string;
}

/** A function/tool the model may call during a conversation. */
export interface LlmTool {
  name: string;
  description: string;
  /** JSON Schema for the tool arguments. */
  parameters: Record<string, unknown>;
}

/** A streamed piece of the model's response: text delta and/or a tool call. */
export interface LlmStreamChunk {
  textDelta?: string;
  toolCall?: {
    id: string;
    name: string;
    argumentsDelta: string;
  };
  done: boolean;
}

export interface LlmCompletionOptions extends ProviderConfig {
  model: string;
  messages: LlmMessage[];
  tools?: LlmTool[];
  temperature?: number;
  maxTokens?: number;
}

/**
 * Streaming chat-completion provider with tool/function calling. Keeping this
 * provider-agnostic lets the voice-worker swap or fall back between LLMs.
 */
export interface LlmProvider {
  readonly name: string;
  complete(options: LlmCompletionOptions): AsyncIterable<LlmStreamChunk>;
}
