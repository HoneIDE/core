/**
 * AWS Bedrock adapter — invokes foundation models via Bedrock API.
 */
import type {
  AIProviderAdapter, AIProviderConfig, AICompletionRequest,
  AICompletionResponse, AIStreamChunk, AIModelInfo,
} from '../ai-protocol';

export class BedrockAdapter implements AIProviderAdapter {
  readonly id = 'bedrock';
  readonly name = 'AWS Bedrock';

  listModels(): AIModelInfo[] {
    return [
      { id: 'anthropic.claude-3-5-sonnet-20241022-v2:0', name: 'Claude 3.5 Sonnet v2 (Bedrock)', contextWindow: 200000, supportsTools: true, supportsStreaming: true, supportsVision: true },
      { id: 'meta.llama3-1-70b-instruct-v1:0', name: 'Llama 3.1 70B (Bedrock)', contextWindow: 128000, supportsTools: false, supportsStreaming: true, supportsVision: false },
    ];
  }

  private isClaudeModel(model: string): boolean {
    return model.startsWith('anthropic.');
  }

  buildRequest(req: AICompletionRequest, config: AIProviderConfig) {
    const region = config.region ?? 'us-east-1';
    const baseUrl = config.baseUrl ?? `https://bedrock-runtime.${region}.amazonaws.com`;
    const url = `${baseUrl}/model/${req.model}/invoke`;

    let bodyObj: Record<string, unknown>;

    if (this.isClaudeModel(req.model)) {
      // Anthropic Messages format for Claude models
      let system: string | undefined;
      const messages: { role: string; content: string }[] = [];
      for (const msg of req.messages) {
        if (msg.role === 'system') {
          system = msg.content;
        } else {
          messages.push({ role: msg.role, content: msg.content });
        }
      }

      bodyObj = {
        anthropic_version: 'bedrock-2023-05-31',
        messages,
        max_tokens: req.maxTokens ?? 4096,
      };
      if (system) bodyObj.system = system;
      if (req.temperature !== undefined) bodyObj.temperature = req.temperature;
      if (req.stopSequences) bodyObj.stop_sequences = req.stopSequences;
      if (req.tools && req.tools.length > 0) {
        bodyObj.tools = req.tools.map(t => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters,
        }));
      }
    } else {
      // Generic format for other models
      const prompt = req.messages.map(m => `${m.role}: ${m.content}`).join('\n');
      bodyObj = {
        prompt,
        max_gen_len: req.maxTokens ?? 2048,
      };
      if (req.temperature !== undefined) bodyObj.temperature = req.temperature;
    }

    // Build AWS SigV4 Authorization header shape (actual signing is a TODO)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `AWS4-HMAC-SHA256 Credential=${config.apiKey ?? 'ACCESS_KEY'}/${new Date().toISOString().slice(0, 10).replace(/-/g, '')}/${region}/bedrock/aws4_request, SignedHeaders=content-type;host, Signature=TODO`,
    };

    return {
      method: 'POST',
      url,
      headers,
      body: JSON.stringify(bodyObj),
    };
  }

  parseResponse(responseBody: string): AICompletionResponse {
    const data = JSON.parse(responseBody);

    // Try Anthropic format first
    if (data.content && Array.isArray(data.content)) {
      let content = '';
      const toolCalls: AICompletionResponse['toolCalls'] = [];

      for (const block of data.content) {
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

    // Generic format
    return {
      content: data.generation ?? data.output ?? '',
      toolCalls: [],
      finishReason: 'stop',
      usage: {
        promptTokens: data.prompt_token_count ?? 0,
        completionTokens: data.generation_token_count ?? 0,
        totalTokens: (data.prompt_token_count ?? 0) + (data.generation_token_count ?? 0),
      },
    };
  }

  parseStreamChunk(line: string): AIStreamChunk | null {
    if (!line.trim()) return null;

    try {
      const data = JSON.parse(line);
      if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
        return { type: 'text', text: data.delta.text };
      }
      if (data.type === 'message_stop') {
        return { type: 'done' };
      }
      if (data.generation) {
        return { type: 'text', text: data.generation };
      }
    } catch {
      return null;
    }
    return null;
  }

  buildTestRequest(config: AIProviderConfig) {
    const region = config.region ?? 'us-east-1';
    const baseUrl = config.baseUrl ?? `https://bedrock-runtime.${region}.amazonaws.com`;
    return {
      method: 'GET',
      url: `${baseUrl}/foundation-models`,
      headers: {
        'Authorization': `AWS4-HMAC-SHA256 Credential=${config.apiKey ?? 'ACCESS_KEY'}/TODO`,
      },
    };
  }
}
