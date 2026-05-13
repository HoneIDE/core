/**
 * OpenAI-compatible adapter — works with any OpenAI-compatible API endpoint.
 */
import type {
  AIProviderAdapter, AIProviderConfig, AICompletionRequest,
  AICompletionResponse, AIStreamChunk, AIModelInfo,
} from '../ai-protocol';

export class OpenAICompatAdapter implements AIProviderAdapter {
  readonly id = 'openai-compat';
  readonly name = 'OpenAI Compatible';

  listModels(): AIModelInfo[] {
    // User configures models; no built-in list
    return [];
  }

  buildRequest(req: AICompletionRequest, config: AIProviderConfig) {
    const baseUrl = config.baseUrl ?? 'http://localhost:8080';
    const messages = req.messages.map(m => ({ role: m.role, content: m.content }));

    const body: Record<string, unknown> = {
      model: req.model,
      messages,
    };
    if (req.maxTokens) body.max_tokens = req.maxTokens;
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.stopSequences) body.stop = req.stopSequences;
    if (req.stream) body.stream = true;
    if (req.tools && req.tools.length > 0) {
      body.tools = req.tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

    return {
      method: 'POST',
      url: `${baseUrl}/v1/chat/completions`,
      headers,
      body: JSON.stringify(body),
    };
  }

  parseResponse(responseBody: string): AICompletionResponse {
    const data = JSON.parse(responseBody);
    const choice = data.choices?.[0];
    const msg = choice?.message;

    const toolCalls: AICompletionResponse['toolCalls'] = [];
    if (msg?.tool_calls) {
      for (const tc of msg.tool_calls) {
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        });
      }
    }

    let finishReason: AICompletionResponse['finishReason'] = 'stop';
    if (choice?.finish_reason === 'tool_calls') finishReason = 'tool_use';
    if (choice?.finish_reason === 'length') finishReason = 'max_tokens';

    return {
      content: msg?.content ?? '',
      toolCalls,
      finishReason,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
    };
  }

  parseStreamChunk(line: string): AIStreamChunk | null {
    if (!line.startsWith('data: ')) return null;
    const jsonStr = line.slice(6);
    if (jsonStr === '[DONE]') return { type: 'done' };

    try {
      const data = JSON.parse(jsonStr);
      const delta = data.choices?.[0]?.delta;
      if (!delta) return null;

      if (delta.content) {
        return { type: 'text', text: delta.content };
      }
      if (delta.tool_calls?.[0]) {
        const tc = delta.tool_calls[0];
        if (tc.function?.name) {
          return { type: 'tool_call_start', toolCallId: tc.id, toolName: tc.function.name };
        }
        if (tc.function?.arguments) {
          return { type: 'tool_call_delta', toolArgDelta: tc.function.arguments };
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  buildTestRequest(config: AIProviderConfig) {
    const baseUrl = config.baseUrl ?? 'http://localhost:8080';
    return {
      method: 'GET',
      url: `${baseUrl}/v1/models`,
      headers: config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {},
    };
  }
}
