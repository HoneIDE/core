/**
 * Anthropic (Claude) adapter — Messages API.
 */
import type {
  AIProviderAdapter, AIProviderConfig, AICompletionRequest,
  AICompletionResponse, AIStreamChunk, AIModelInfo,
} from '../ai-protocol';

export class AnthropicAdapter implements AIProviderAdapter {
  readonly id = 'anthropic';
  readonly name = 'Anthropic';

  listModels(): AIModelInfo[] {
    return [
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', contextWindow: 200000, supportsTools: true, supportsStreaming: true, supportsVision: true },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', contextWindow: 200000, supportsTools: true, supportsStreaming: true, supportsVision: true },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', contextWindow: 200000, supportsTools: true, supportsStreaming: true, supportsVision: true },
    ];
  }

  buildRequest(req: AICompletionRequest, config: AIProviderConfig) {
    const baseUrl = config.baseUrl ?? 'https://api.anthropic.com';

    // Extract system message
    let system: string | undefined;
    const messages: { role: string; content: string }[] = [];
    for (const msg of req.messages) {
      if (msg.role === 'system') {
        system = msg.content;
      } else {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    const body: Record<string, unknown> = {
      model: req.model,
      messages,
      max_tokens: req.maxTokens ?? 4096,
    };
    if (system) body.system = system;
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.stopSequences) body.stop_sequences = req.stopSequences;
    if (req.stream) body.stream = true;
    if (req.tools && req.tools.length > 0) {
      body.tools = req.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    return {
      method: 'POST',
      url: `${baseUrl}/v1/messages`,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    };
  }

  parseResponse(responseBody: string): AICompletionResponse {
    const data = JSON.parse(responseBody);
    let content = '';
    const toolCalls: AICompletionResponse['toolCalls'] = [];

    for (const block of data.content ?? []) {
      if (block.type === 'text') {
        content += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input),
        });
      }
    }

    let finishReason: AICompletionResponse['finishReason'] = 'stop';
    if (data.stop_reason === 'tool_use') finishReason = 'tool_use';
    if (data.stop_reason === 'max_tokens') finishReason = 'max_tokens';

    return {
      content,
      toolCalls,
      finishReason,
      usage: {
        promptTokens: data.usage?.input_tokens ?? 0,
        completionTokens: data.usage?.output_tokens ?? 0,
        totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      },
    };
  }

  parseStreamChunk(line: string): AIStreamChunk | null {
    if (!line.startsWith('data: ')) return null;
    const jsonStr = line.slice(6);
    if (jsonStr === '[DONE]') return { type: 'done' };

    try {
      const data = JSON.parse(jsonStr);
      if (data.type === 'content_block_start') {
        if (data.content_block?.type === 'tool_use') {
          return {
            type: 'tool_call_start',
            toolCallId: data.content_block.id,
            toolName: data.content_block.name,
          };
        }
        return null;
      }
      if (data.type === 'content_block_delta') {
        if (data.delta?.type === 'text_delta') {
          return { type: 'text', text: data.delta.text };
        }
        if (data.delta?.type === 'input_json_delta') {
          return { type: 'tool_call_delta', toolArgDelta: data.delta.partial_json };
        }
      }
      if (data.type === 'content_block_stop') {
        return { type: 'tool_call_end' };
      }
      if (data.type === 'message_stop') {
        return { type: 'done' };
      }
      if (data.type === 'error') {
        return { type: 'error', error: data.error?.message ?? 'Unknown error' };
      }
    } catch {
      return null;
    }
    return null;
  }

  buildTestRequest(config: AIProviderConfig) {
    const baseUrl = config.baseUrl ?? 'https://api.anthropic.com';
    return {
      method: 'POST',
      url: `${baseUrl}/v1/messages`,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        messages: [{ role: 'user', content: 'Say "ok"' }],
        max_tokens: 10,
      }),
    };
  }
}
