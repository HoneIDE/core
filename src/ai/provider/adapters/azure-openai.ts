/**
 * Azure OpenAI adapter — OpenAI models via Azure deployments.
 */
import type {
  AIProviderAdapter, AIProviderConfig, AICompletionRequest,
  AICompletionResponse, AIStreamChunk, AIModelInfo,
} from '../ai-protocol';

export class AzureOpenAIAdapter implements AIProviderAdapter {
  readonly id = 'azure-openai';
  readonly name = 'Azure OpenAI';

  listModels(): AIModelInfo[] {
    return [
      { id: 'gpt-4o', name: 'GPT-4o (Azure)', contextWindow: 128000, supportsTools: true, supportsStreaming: true, supportsVision: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Azure)', contextWindow: 128000, supportsTools: true, supportsStreaming: true, supportsVision: true },
    ];
  }

  buildRequest(req: AICompletionRequest, config: AIProviderConfig) {
    const baseUrl = config.baseUrl ?? 'https://my-resource.openai.azure.com';
    const deploymentId = config.deploymentId ?? req.model;
    const url = `${baseUrl}/openai/deployments/${deploymentId}/chat/completions?api-version=2024-06-01`;

    const messages = req.messages.map(m => ({ role: m.role, content: m.content }));

    const body: Record<string, unknown> = {
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

    return {
      method: 'POST',
      url,
      headers: {
        'Content-Type': 'application/json',
        'api-key': config.apiKey ?? '',
      },
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
    const baseUrl = config.baseUrl ?? 'https://my-resource.openai.azure.com';
    const deploymentId = config.deploymentId ?? 'gpt-4o';
    return {
      method: 'POST',
      url: `${baseUrl}/openai/deployments/${deploymentId}/chat/completions?api-version=2024-06-01`,
      headers: {
        'Content-Type': 'application/json',
        'api-key': config.apiKey ?? '',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Say "ok"' }],
        max_tokens: 10,
      }),
    };
  }
}
