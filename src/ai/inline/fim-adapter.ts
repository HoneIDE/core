/**
 * Fill-in-the-middle (FIM) formatting per AI provider.
 *
 * Different providers use different tokens/formats for FIM requests.
 * This adapter normalises the interface.
 */

export interface FIMContext {
  /** Text before the cursor */
  prefix: string;
  /** Text after the cursor */
  suffix: string;
  /** The file path (for language detection hints) */
  filePath: string;
  /** Optional language identifier */
  language?: string;
}

export interface FIMRequest {
  /** The prompt to send to the model */
  prompt: string;
  /** Whether to use the FIM-specific API format (vs messages API) */
  useFIMEndpoint: boolean;
  /** Structured FIM fields (if useFIMEndpoint) */
  prefix?: string;
  suffix?: string;
  /** Extra stop sequences to add */
  stopSequences: string[];
}

/**
 * Format a FIM request for Anthropic Claude.
 * Claude uses the Messages API — we build a prompt that instructs it
 * to continue the code from the cursor position.
 */
export function formatAnthropicFIM(ctx: FIMContext): FIMRequest {
  const lang = ctx.language ?? detectLanguage(ctx.filePath);
  const prompt = `Continue the following ${lang} code from where the cursor is marked with <CURSOR>. Only output the completion, no explanation.\n\n${ctx.prefix}<CURSOR>${ctx.suffix}`;

  return {
    prompt,
    useFIMEndpoint: false,
    stopSequences: ['\n\n', '\n}', '\nfunction ', '\nclass ', '\nexport ', '\nimport '],
  };
}

/**
 * Format a FIM request for OpenAI (uses messages API with system prompt).
 */
export function formatOpenAIFIM(ctx: FIMContext): FIMRequest {
  const lang = ctx.language ?? detectLanguage(ctx.filePath);
  const prompt = `Continue the following ${lang} code from where the cursor is marked with <CURSOR>. Only output the completion, no explanation.\n\n${ctx.prefix}<CURSOR>${ctx.suffix}`;

  return {
    prompt,
    useFIMEndpoint: false,
    stopSequences: ['\n\n', '\n}', '\nfunction ', '\nclass ', '\nexport ', '\nimport '],
  };
}

/**
 * Format a FIM request for models that support native FIM (e.g. Codestral).
 */
export function formatNativeFIM(ctx: FIMContext): FIMRequest {
  return {
    prompt: '',
    useFIMEndpoint: true,
    prefix: ctx.prefix,
    suffix: ctx.suffix,
    stopSequences: [],
  };
}

/**
 * Get the appropriate FIM formatter for a given provider.
 */
export function getFIMFormatter(providerId: string): (ctx: FIMContext) => FIMRequest {
  if (providerId === 'anthropic') return formatAnthropicFIM;
  if (providerId === 'openai') return formatOpenAIFIM;
  return formatAnthropicFIM; // default
}

/** Simple language detection from file extension. */
function detectLanguage(filePath: string): string {
  const dotIdx = filePath.lastIndexOf('.');
  if (dotIdx < 0) return 'code';
  const ext = filePath.slice(dotIdx + 1).toLowerCase();

  if (ext === 'ts' || ext === 'tsx') return 'TypeScript';
  if (ext === 'js' || ext === 'jsx') return 'JavaScript';
  if (ext === 'py') return 'Python';
  if (ext === 'rs') return 'Rust';
  if (ext === 'go') return 'Go';
  if (ext === 'java') return 'Java';
  if (ext === 'c' || ext === 'h') return 'C';
  if (ext === 'cpp' || ext === 'cc' || ext === 'hpp') return 'C++';
  if (ext === 'swift') return 'Swift';
  if (ext === 'rb') return 'Ruby';
  if (ext === 'css') return 'CSS';
  if (ext === 'html') return 'HTML';
  if (ext === 'json') return 'JSON';
  if (ext === 'yaml' || ext === 'yml') return 'YAML';
  if (ext === 'md') return 'Markdown';
  if (ext === 'sh' || ext === 'bash') return 'Shell';
  return 'code';
}

export { detectLanguage };
