/**
 * Google Gemini adapter — Gemini API.
 */
import type {
  AIProviderAdapter, AIProviderConfig, AICompletionRequest,
  AICompletionResponse, AIStreamChunk, AIModelInfo,
} from '../ai-protocol';

export class GoogleAdapter implements AIProviderAdapter {
  readonly id = 'google';
  readonly name = 'Google Gemini';

  listModels(): AIModelInfo[] {
    // TODO(verify): confirm current Gemini model ids and context windows.
    return [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextWindow: 1048576, supportsTools: true, supportsStreaming: true, supportsVision: true },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', contextWindow: 1048576, supportsTools: true, supportsStreaming: true, supportsVision: true },
    ];
  }

  buildRequest(req: AICompletionRequest, config: AIProviderConfig) {
    const baseUrl = config.baseUrl ?? 'https://generativelanguage.googleapis.com';
    const action = req.stream ? 'streamGenerateContent' : 'generateContent';
    const url = `${baseUrl}/v1beta/models/${req.model}:${action}?key=${config.apiKey ?? ''}`;

    const contents: { role: string; parts: { text: string }[] }[] = [];
    let systemInstruction: { parts: { text: string }[] } | undefined;

    for (const msg of req.messages) {
      if (msg.role === 'system') {
        systemInstruction = { parts: [{ text: msg.content }] };
      } else {
        const role = msg.role === 'assistant' ? 'model' : 'user';
        contents.push({ role, parts: [{ text: msg.content }] });
      }
    }

    const body: Record<string, unknown> = { contents };
    if (systemInstruction) body.systemInstruction = systemInstruction;

    const generationConfig: Record<string, unknown> = {};
    if (req.maxTokens) generationConfig.maxOutputTokens = req.maxTokens;
    if (req.temperature !== undefined) generationConfig.temperature = req.temperature;
    if (req.stopSequences) generationConfig.stopSequences = req.stopSequences;
    if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;

    if (req.tools && req.tools.length > 0) {
      body.tools = [{
        functionDeclarations: req.tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      }];
    }

    return {
      method: 'POST',
      url,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    };
  }

  parseResponse(responseBody: string): AICompletionResponse {
    const data = JSON.parse(responseBody);
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];

    let content = '';
    const toolCalls: AICompletionResponse['toolCalls'] = [];

    for (const part of parts) {
      if (part.text) {
        content += part.text;
      } else if (part.functionCall) {
        toolCalls.push({
          id: part.functionCall.name,
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args),
        });
      }
    }

    let finishReason: AICompletionResponse['finishReason'] = 'stop';
    if (candidate?.finishReason === 'MAX_TOKENS') finishReason = 'max_tokens';
    if (toolCalls.length > 0) finishReason = 'tool_use';

    return {
      content,
      toolCalls,
      finishReason,
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
      },
    };
  }

  parseStreamChunk(line: string): AIStreamChunk | null {
    if (!line.startsWith('data: ')) return null;
    const jsonStr = line.slice(6);
    if (jsonStr === '[DONE]') return { type: 'done' };

    try {
      const data = JSON.parse(jsonStr);
      const parts = data.candidates?.[0]?.content?.parts;
      if (!parts || parts.length === 0) return null;

      for (const part of parts) {
        if (part.text) {
          return { type: 'text', text: part.text };
        }
        if (part.functionCall) {
          return {
            type: 'tool_call_start',
            toolCallId: part.functionCall.name,
            toolName: part.functionCall.name,
          };
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  buildTestRequest(config: AIProviderConfig) {
    const baseUrl = config.baseUrl ?? 'https://generativelanguage.googleapis.com';
    return {
      method: 'POST',
      url: `${baseUrl}/v1beta/models/gemini-2.0-flash:generateContent?key=${config.apiKey ?? ''}`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Say "ok"' }] }],
        generationConfig: { maxOutputTokens: 10 },
      }),
    };
  }
}
