/**
 * Tests for Slice 8: AI Provider system.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import {
  ProviderRegistry,
  ModelRouter,
  estimateTokens, estimateMessageTokens, fitsInContext, truncateToFit,
  AnthropicAdapter,
  OpenAIAdapter,
  GoogleAdapter,
  OllamaAdapter,
  OpenAICompatAdapter,
  BedrockAdapter,
  VertexAdapter,
  AzureOpenAIAdapter,
  type AICompletionRequest, type AIProviderConfig,
} from '../src/ai/provider/index';

// =============================================================================
// AnthropicAdapter
// =============================================================================

describe('AnthropicAdapter', () => {
  const adapter = new AnthropicAdapter();
  const config: AIProviderConfig = { apiKey: 'test-key' };

  test('has correct ID and name', () => {
    expect(adapter.id).toBe('anthropic');
    expect(adapter.name).toBe('Anthropic');
  });

  test('lists models', () => {
    const models = adapter.listModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models[0].supportsTools).toBe(true);
    expect(models[0].contextWindow).toBeGreaterThan(0);
  });

  test('buildRequest produces correct URL', () => {
    const req: AICompletionRequest = {
      messages: [{ role: 'user', content: 'Hello' }],
      model: 'claude-sonnet-4-6',
    };
    const result = adapter.buildRequest(req, config);
    expect(result.method).toBe('POST');
    expect(result.url).toBe('https://api.anthropic.com/v1/messages');
    expect(result.headers['x-api-key']).toBe('test-key');
    expect(result.headers['anthropic-version']).toBe('2023-06-01');
  });

  test('buildRequest extracts system message', () => {
    const req: AICompletionRequest = {
      messages: [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
      ],
      model: 'claude-sonnet-4-6',
    };
    const result = adapter.buildRequest(req, config);
    const body = JSON.parse(result.body);
    expect(body.system).toBe('You are helpful');
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe('user');
  });

  test('buildRequest includes tools', () => {
    const req: AICompletionRequest = {
      messages: [{ role: 'user', content: 'test' }],
      model: 'claude-sonnet-4-6',
      tools: [{ name: 'read', description: 'Read file', parameters: { type: 'object' } }],
    };
    const result = adapter.buildRequest(req, config);
    const body = JSON.parse(result.body);
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].name).toBe('read');
    expect(body.tools[0].input_schema).toBeDefined();
  });

  test('buildRequest uses custom base URL', () => {
    const customConfig: AIProviderConfig = { apiKey: 'key', baseUrl: 'https://custom.api.com' };
    const req: AICompletionRequest = {
      messages: [{ role: 'user', content: 'hi' }],
      model: 'test',
    };
    const result = adapter.buildRequest(req, customConfig);
    expect(result.url).toBe('https://custom.api.com/v1/messages');
  });

  test('parseResponse extracts text content', () => {
    const responseBody = JSON.stringify({
      content: [{ type: 'text', text: 'Hello there!' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const result = adapter.parseResponse(responseBody);
    expect(result.content).toBe('Hello there!');
    expect(result.finishReason).toBe('stop');
    expect(result.usage.promptTokens).toBe(10);
    expect(result.usage.completionTokens).toBe(5);
  });

  test('parseResponse extracts tool calls', () => {
    const responseBody = JSON.stringify({
      content: [
        { type: 'text', text: 'Let me read that file.' },
        { type: 'tool_use', id: 'tc1', name: 'read_file', input: { path: '/a.ts' } },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 20, output_tokens: 15 },
    });
    const result = adapter.parseResponse(responseBody);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].id).toBe('tc1');
    expect(result.toolCalls[0].name).toBe('read_file');
    expect(JSON.parse(result.toolCalls[0].arguments)).toEqual({ path: '/a.ts' });
    expect(result.finishReason).toBe('tool_use');
  });

  test('parseStreamChunk handles text delta', () => {
    const chunk = adapter.parseStreamChunk('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}');
    expect(chunk).not.toBeNull();
    expect(chunk!.type).toBe('text');
    expect(chunk!.text).toBe('Hello');
  });

  test('parseStreamChunk handles tool start', () => {
    const chunk = adapter.parseStreamChunk('data: {"type":"content_block_start","content_block":{"type":"tool_use","id":"tc1","name":"read"}}');
    expect(chunk!.type).toBe('tool_call_start');
    expect(chunk!.toolName).toBe('read');
  });

  test('parseStreamChunk handles message_stop', () => {
    const chunk = adapter.parseStreamChunk('data: {"type":"message_stop"}');
    expect(chunk!.type).toBe('done');
  });

  test('parseStreamChunk handles [DONE]', () => {
    const chunk = adapter.parseStreamChunk('data: [DONE]');
    expect(chunk!.type).toBe('done');
  });

  test('parseStreamChunk returns null for non-data lines', () => {
    expect(adapter.parseStreamChunk('event: message_start')).toBeNull();
    expect(adapter.parseStreamChunk('')).toBeNull();
  });

  test('buildTestRequest produces valid request', () => {
    const result = adapter.buildTestRequest(config);
    expect(result.method).toBe('POST');
    expect(result.url).toContain('/v1/messages');
    expect(result.headers['x-api-key']).toBe('test-key');
  });
});

// =============================================================================
// OpenAIAdapter
// =============================================================================

describe('OpenAIAdapter', () => {
  const adapter = new OpenAIAdapter();
  const config: AIProviderConfig = { apiKey: 'test-key' };

  test('has correct ID and name', () => {
    expect(adapter.id).toBe('openai');
    expect(adapter.name).toBe('OpenAI');
  });

  test('buildRequest produces correct URL and auth', () => {
    const req: AICompletionRequest = {
      messages: [{ role: 'user', content: 'Hello' }],
      model: 'gpt-4o',
    };
    const result = adapter.buildRequest(req, config);
    expect(result.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(result.headers['Authorization']).toBe('Bearer test-key');
  });

  test('buildRequest includes organization header', () => {
    const orgConfig: AIProviderConfig = { apiKey: 'key', organization: 'org-123' };
    const req: AICompletionRequest = {
      messages: [{ role: 'user', content: 'hi' }],
      model: 'gpt-4o',
    };
    const result = adapter.buildRequest(req, orgConfig);
    expect(result.headers['OpenAI-Organization']).toBe('org-123');
  });

  test('parseResponse extracts content', () => {
    const responseBody = JSON.stringify({
      choices: [{ message: { content: 'Hello!' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
    });
    const result = adapter.parseResponse(responseBody);
    expect(result.content).toBe('Hello!');
    expect(result.usage.totalTokens).toBe(8);
  });

  test('parseResponse extracts tool calls', () => {
    const responseBody = JSON.stringify({
      choices: [{
        message: {
          content: null,
          tool_calls: [{ id: 'call_1', function: { name: 'read', arguments: '{"path":"/a.ts"}' } }],
        },
        finish_reason: 'tool_calls',
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
    const result = adapter.parseResponse(responseBody);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe('read');
    expect(result.finishReason).toBe('tool_use');
  });

  test('parseStreamChunk handles text', () => {
    const chunk = adapter.parseStreamChunk('data: {"choices":[{"delta":{"content":"Hi"}}]}');
    expect(chunk!.type).toBe('text');
    expect(chunk!.text).toBe('Hi');
  });

  test('parseStreamChunk handles [DONE]', () => {
    const chunk = adapter.parseStreamChunk('data: [DONE]');
    expect(chunk!.type).toBe('done');
  });
});

// =============================================================================
// ProviderRegistry
// =============================================================================

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  test('register and get', () => {
    const adapter = new AnthropicAdapter();
    registry.register(adapter, { apiKey: 'key' });
    const p = registry.get('anthropic');
    expect(p).toBeDefined();
    expect(p!.adapter.id).toBe('anthropic');
    expect(p!.config.apiKey).toBe('key');
    expect(p!.enabled).toBe(true);
  });

  test('getAll returns all providers', () => {
    registry.register(new AnthropicAdapter(), { apiKey: 'a' });
    registry.register(new OpenAIAdapter(), { apiKey: 'b' });
    expect(registry.getAll()).toHaveLength(2);
  });

  test('setEnabled toggles provider', () => {
    registry.register(new AnthropicAdapter(), { apiKey: 'a' });
    registry.setEnabled('anthropic', false);
    expect(registry.get('anthropic')!.enabled).toBe(false);
    expect(registry.getEnabled()).toHaveLength(0);
  });

  test('updateConfig merges config', () => {
    registry.register(new AnthropicAdapter(), { apiKey: 'old' });
    registry.updateConfig('anthropic', { apiKey: 'new', baseUrl: 'https://custom.com' });
    const p = registry.get('anthropic')!;
    expect(p.config.apiKey).toBe('new');
    expect(p.config.baseUrl).toBe('https://custom.com');
  });

  test('unregister removes provider', () => {
    registry.register(new AnthropicAdapter(), { apiKey: 'a' });
    registry.unregister('anthropic');
    expect(registry.has('anthropic')).toBe(false);
    expect(registry.count()).toBe(0);
  });
});

// =============================================================================
// ModelRouter
// =============================================================================

describe('ModelRouter', () => {
  let router: ModelRouter;

  beforeEach(() => {
    router = new ModelRouter();
  });

  test('returns null when no routes configured', () => {
    expect(router.getRoute('chat')).toBeNull();
  });

  test('uses default route when no feature-specific route', () => {
    router.setDefault('anthropic', 'claude-sonnet-4-6');
    const route = router.getRoute('chat');
    expect(route).not.toBeNull();
    expect(route!.providerId).toBe('anthropic');
    expect(route!.modelId).toBe('claude-sonnet-4-6');
  });

  test('feature-specific route overrides default', () => {
    router.setDefault('anthropic', 'claude-sonnet-4-6');
    router.setRoute('inline_completion', 'anthropic', 'claude-haiku-4-5-20251001');
    expect(router.getRoute('chat')!.modelId).toBe('claude-sonnet-4-6');
    expect(router.getRoute('inline_completion')!.modelId).toBe('claude-haiku-4-5-20251001');
  });

  test('removeRoute falls back to default', () => {
    router.setDefault('anthropic', 'claude-sonnet-4-6');
    router.setRoute('chat', 'openai', 'gpt-4o');
    router.removeRoute('chat');
    expect(router.getRoute('chat')!.providerId).toBe('anthropic');
  });
});

// =============================================================================
// Token Counter
// =============================================================================

describe('token estimation', () => {
  test('estimateTokens approximates correctly', () => {
    // ~4 chars per token
    expect(estimateTokens('hello world')).toBe(3); // 11/4 = 2.75 → 3
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('a'.repeat(100))).toBe(25);
  });

  test('estimateMessageTokens includes overhead', () => {
    const msgs = [
      { role: 'user', content: 'hello' },  // 4 + ceil(5/4) = 6
    ];
    const est = estimateMessageTokens(msgs);
    expect(est).toBe(6);
  });

  test('fitsInContext returns true when fits', () => {
    const msgs = [{ role: 'user', content: 'short message' }];
    expect(fitsInContext(msgs, 100000)).toBe(true);
  });

  test('fitsInContext returns false when too large', () => {
    const msgs = [{ role: 'user', content: 'a'.repeat(10000) }];
    expect(fitsInContext(msgs, 100, 50)).toBe(false);
  });

  test('truncateToFit keeps first and last messages', () => {
    const msgs = [
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'a'.repeat(100) },
      { role: 'assistant', content: 'b'.repeat(100) },
      { role: 'user', content: 'latest' },
    ];
    const result = truncateToFit(msgs, 50, 10);
    expect(result.length).toBeLessThanOrEqual(msgs.length);
    expect(result[0].role).toBe('system');
    expect(result[result.length - 1].content).toBe('latest');
  });
});

// =============================================================================
// GoogleAdapter
// =============================================================================

describe('GoogleAdapter', () => {
  const adapter = new GoogleAdapter();
  const config: AIProviderConfig = { apiKey: 'test-google-key' };

  test('has correct ID and name', () => {
    expect(adapter.id).toBe('google');
    expect(adapter.name).toBe('Google Gemini');
  });

  test('buildRequest URL format includes model and key', () => {
    const req: AICompletionRequest = {
      messages: [{ role: 'user', content: 'Hello' }],
      model: 'gemini-2.0-flash',
    };
    const result = adapter.buildRequest(req, config);
    expect(result.url).toContain('/v1beta/models/gemini-2.0-flash:generateContent');
    expect(result.url).toContain('key=test-google-key');
  });

  test('buildRequest body uses contents/parts format', () => {
    const req: AICompletionRequest = {
      messages: [{ role: 'user', content: 'Hello world' }],
      model: 'gemini-2.0-flash',
    };
    const result = adapter.buildRequest(req, config);
    const body = JSON.parse(result.body);
    expect(body.contents).toBeDefined();
    expect(body.contents[0].role).toBe('user');
    expect(body.contents[0].parts[0].text).toBe('Hello world');
  });

  test('parseResponse extracts text from candidates', () => {
    const responseBody = JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Hi there!' }] } }],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3, totalTokenCount: 8 },
    });
    const result = adapter.parseResponse(responseBody);
    expect(result.content).toBe('Hi there!');
    expect(result.usage.totalTokens).toBe(8);
  });
});

// =============================================================================
// OllamaAdapter
// =============================================================================

describe('OllamaAdapter', () => {
  const adapter = new OllamaAdapter();
  const config: AIProviderConfig = {};

  test('has correct ID and name', () => {
    expect(adapter.id).toBe('ollama');
    expect(adapter.name).toBe('Ollama');
  });

  test('buildRequest uses no auth header', () => {
    const req: AICompletionRequest = {
      messages: [{ role: 'user', content: 'Hello' }],
      model: 'llama3:8b',
    };
    const result = adapter.buildRequest(req, config);
    expect(result.headers['Authorization']).toBeUndefined();
    expect(result.url).toBe('http://localhost:11434/api/chat');
  });

  test('buildRequest body format has model and messages', () => {
    const req: AICompletionRequest = {
      messages: [{ role: 'user', content: 'Hello' }],
      model: 'llama3:8b',
      temperature: 0.7,
    };
    const result = adapter.buildRequest(req, config);
    const body = JSON.parse(result.body);
    expect(body.model).toBe('llama3:8b');
    expect(body.messages[0].role).toBe('user');
    expect(body.messages[0].content).toBe('Hello');
    expect(body.options.temperature).toBe(0.7);
  });

  test('parseResponse extracts message content', () => {
    const responseBody = JSON.stringify({
      message: { content: 'Hello from Ollama!' },
      done: true,
      prompt_eval_count: 10,
      eval_count: 5,
    });
    const result = adapter.parseResponse(responseBody);
    expect(result.content).toBe('Hello from Ollama!');
    expect(result.finishReason).toBe('stop');
  });
});

// =============================================================================
// OpenAICompatAdapter
// =============================================================================

describe('OpenAICompatAdapter', () => {
  const adapter = new OpenAICompatAdapter();

  test('has correct ID and name', () => {
    expect(adapter.id).toBe('openai-compat');
    expect(adapter.name).toBe('OpenAI Compatible');
  });

  test('buildRequest with custom baseUrl', () => {
    const config: AIProviderConfig = { apiKey: 'my-key', baseUrl: 'https://my-llm-server.com' };
    const req: AICompletionRequest = {
      messages: [{ role: 'user', content: 'test' }],
      model: 'local-model',
    };
    const result = adapter.buildRequest(req, config);
    expect(result.url).toBe('https://my-llm-server.com/v1/chat/completions');
    expect(result.headers['Authorization']).toBe('Bearer my-key');
  });
});

// =============================================================================
// BedrockAdapter
// =============================================================================

describe('BedrockAdapter', () => {
  const adapter = new BedrockAdapter();
  const config: AIProviderConfig = { apiKey: 'aws-key', region: 'us-west-2' };

  test('has correct ID and name', () => {
    expect(adapter.id).toBe('bedrock');
    expect(adapter.name).toBe('AWS Bedrock');
  });

  test('buildRequest URL includes model path', () => {
    const req: AICompletionRequest = {
      messages: [{ role: 'user', content: 'Hello' }],
      model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    };
    const result = adapter.buildRequest(req, config);
    expect(result.url).toContain('/model/anthropic.claude-3-5-sonnet-20241022-v2:0/invoke');
    expect(result.url).toContain('us-west-2');
  });

  test('listModels returns bedrock models', () => {
    const models = adapter.listModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models[0].id).toContain('anthropic.');
  });
});

// =============================================================================
// VertexAdapter
// =============================================================================

describe('VertexAdapter', () => {
  const adapter = new VertexAdapter();
  const config: AIProviderConfig = { apiKey: 'token', projectId: 'my-gcp-project', region: 'europe-west4' };

  test('has correct ID and name', () => {
    expect(adapter.id).toBe('vertex');
    expect(adapter.name).toBe('Google Vertex AI');
  });

  test('buildRequest URL includes project and location', () => {
    const req: AICompletionRequest = {
      messages: [{ role: 'user', content: 'Hello' }],
      model: 'gemini-2.5-pro',
    };
    const result = adapter.buildRequest(req, config);
    expect(result.url).toContain('/projects/my-gcp-project/');
    expect(result.url).toContain('/locations/europe-west4/');
    expect(result.url).toContain('/models/gemini-2.5-pro:generateContent');
    expect(result.headers['Authorization']).toBe('Bearer token');
  });
});

// =============================================================================
// AzureOpenAIAdapter
// =============================================================================

describe('AzureOpenAIAdapter', () => {
  const adapter = new AzureOpenAIAdapter();
  const config: AIProviderConfig = { apiKey: 'azure-key', baseUrl: 'https://myresource.openai.azure.com', deploymentId: 'gpt4o-deploy' };

  test('has correct ID and name', () => {
    expect(adapter.id).toBe('azure-openai');
    expect(adapter.name).toBe('Azure OpenAI');
  });

  test('buildRequest URL uses deployment format', () => {
    const req: AICompletionRequest = {
      messages: [{ role: 'user', content: 'Hello' }],
      model: 'gpt-4o',
    };
    const result = adapter.buildRequest(req, config);
    expect(result.url).toContain('/openai/deployments/gpt4o-deploy/chat/completions');
    expect(result.url).toContain('api-version=2024-06-01');
  });

  test('buildRequest uses api-key header', () => {
    const req: AICompletionRequest = {
      messages: [{ role: 'user', content: 'Hello' }],
      model: 'gpt-4o',
    };
    const result = adapter.buildRequest(req, config);
    expect(result.headers['api-key']).toBe('azure-key');
  });
});
