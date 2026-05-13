/**
 * Ollama adapter — local LLM via Ollama API.
 */
import type {
  AIProviderAdapter, AIProviderConfig, AICompletionRequest,
  AICompletionResponse, AIStreamChunk, AIModelInfo,
} from '../ai-protocol';

export class OllamaAdapter implements AIProviderAdapter {
  readonly id = 'ollama';
  readonly name = 'Ollama';

  listModels(): AIModelInfo[] {
    return [
      { id: 'llama3:8b', name: 'Llama 3 8B', contextWindow: 8192, supportsTools: false, supportsStreaming: true, supportsVision: false },
      { id: 'codellama:34b', name: 'Code Llama 34B', contextWindow: 16384, supportsTools: false, supportsStreaming: true, supportsVision: false },
      { id: 'mistral:latest', name: 'Mistral', contextWindow: 32768, supportsTools: false, supportsStreaming: true, supportsVision: false },
    ];
  }

  buildRequest(req: AICompletionRequest, config: AIProviderConfig) {
    const baseUrl = config.baseUrl ?? 'http://localhost:11434';

    const messages: { role: string; content: string }[] = [];
    for (const msg of req.messages) {
      messages.push({ role: msg.role, content: msg.content });
    }

    const body: Record<string, unknown> = {
      model: req.model,
      messages,
      stream: req.stream ?? false,
    };

    const options: Record<string, unknown> = {};
    if (req.temperature !== undefined) options.temperature = req.temperature;
    if (req.maxTokens) options.num_predict = req.maxTokens;
    if (Object.keys(options).length > 0) body.options = options;

    return {
      method: 'POST',
      url: `${baseUrl}/api/chat`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    };
  }

  parseResponse(responseBody: string): AICompletionResponse {
    const data = JSON.parse(responseBody);
    return {
      content: data.message?.content ?? '',
      toolCalls: [],
      finishReason: data.done ? 'stop' : 'max_tokens',
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
    };
  }

  parseStreamChunk(line: string): AIStreamChunk | null {
    if (!line.trim()) return null;

    try {
      const data = JSON.parse(line);
      if (data.done) return { type: 'done' };
      if (data.message?.content) {
        return { type: 'text', text: data.message.content };
      }
    } catch {
      return null;
    }
    return null;
  }

  buildTestRequest(config: AIProviderConfig) {
    const baseUrl = config.baseUrl ?? 'http://localhost:11434';
    return {
      method: 'GET',
      url: `${baseUrl}/api/tags`,
      headers: {},
    };
  }
}
