/**
 * AI Provider protocol — defines the adapter interface all providers implement.
 */

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: AIToolCall[];
}

export interface AIToolCall {
  id: string;
  name: string;
  arguments: string;  // JSON string
}

export interface AIToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;  // JSON Schema
}

export interface AICompletionRequest {
  messages: AIMessage[];
  model: string;
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  tools?: AIToolDefinition[];
  stream?: boolean;
}

export interface AICompletionResponse {
  content: string;
  toolCalls: AIToolCall[];
  finishReason: 'stop' | 'tool_use' | 'max_tokens' | 'error';
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIStreamChunk {
  type: 'text' | 'tool_call_start' | 'tool_call_delta' | 'tool_call_end' | 'done' | 'error';
  text?: string;
  toolCallId?: string;
  toolName?: string;
  toolArgDelta?: string;
  error?: string;
}

export interface AIProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  region?: string;       // for Bedrock
  projectId?: string;    // for Vertex
  deploymentId?: string; // for Azure
  organization?: string; // for OpenAI
  headers?: Record<string, string>;
}

export interface AIModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsVision: boolean;
}

/**
 * The adapter interface every AI provider must implement.
 */
export interface AIProviderAdapter {
  /** Provider identifier (e.g., 'anthropic', 'openai'). */
  readonly id: string;

  /** Human-readable name. */
  readonly name: string;

  /** List available models. */
  listModels(): AIModelInfo[];

  /** Build the HTTP request for a completion. Returns method, url, headers, body. */
  buildRequest(req: AICompletionRequest, config: AIProviderConfig): {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string;
  };

  /** Parse a non-streaming response body. */
  parseResponse(responseBody: string): AICompletionResponse;

  /** Parse a single SSE/NDJSON chunk from streaming. */
  parseStreamChunk(line: string): AIStreamChunk | null;

  /** Test if the provider connection works. */
  buildTestRequest(config: AIProviderConfig): {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
  };
}
