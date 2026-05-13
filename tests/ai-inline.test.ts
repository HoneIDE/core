/**
 * Tests for Slice 9: AI Inline Completion system.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import {
  InlineCompletionProvider,
  CompletionDebouncer,
  CompletionCache,
  formatAnthropicFIM, formatOpenAIFIM, formatNativeFIM,
  getFIMFormatter, detectLanguage,
  type FIMContext,
} from '../src/ai/inline/index';

// =============================================================================
// FIM Adapter
// =============================================================================

describe('FIM Adapter', () => {
  const ctx: FIMContext = {
    prefix: 'function hello() {\n  return ',
    suffix: ';\n}',
    filePath: 'src/main.ts',
  };

  test('formatAnthropicFIM creates prompt with CURSOR marker', () => {
    const result = formatAnthropicFIM(ctx);
    expect(result.prompt).toContain('<CURSOR>');
    expect(result.prompt).toContain('TypeScript');
    expect(result.prompt).toContain(ctx.prefix);
    expect(result.prompt).toContain(ctx.suffix);
    expect(result.useFIMEndpoint).toBe(false);
    expect(result.stopSequences.length).toBeGreaterThan(0);
  });

  test('formatOpenAIFIM creates prompt with CURSOR marker', () => {
    const result = formatOpenAIFIM(ctx);
    expect(result.prompt).toContain('<CURSOR>');
    expect(result.useFIMEndpoint).toBe(false);
  });

  test('formatNativeFIM uses FIM endpoint', () => {
    const result = formatNativeFIM(ctx);
    expect(result.useFIMEndpoint).toBe(true);
    expect(result.prefix).toBe(ctx.prefix);
    expect(result.suffix).toBe(ctx.suffix);
  });

  test('getFIMFormatter returns correct formatter', () => {
    expect(getFIMFormatter('anthropic')).toBe(formatAnthropicFIM);
    expect(getFIMFormatter('openai')).toBe(formatOpenAIFIM);
    // Default to anthropic
    expect(getFIMFormatter('unknown')).toBe(formatAnthropicFIM);
  });

  test('detectLanguage detects from file extension', () => {
    expect(detectLanguage('test.ts')).toBe('TypeScript');
    expect(detectLanguage('test.tsx')).toBe('TypeScript');
    expect(detectLanguage('test.js')).toBe('JavaScript');
    expect(detectLanguage('test.py')).toBe('Python');
    expect(detectLanguage('test.rs')).toBe('Rust');
    expect(detectLanguage('test.go')).toBe('Go');
    expect(detectLanguage('test.swift')).toBe('Swift');
    expect(detectLanguage('test.c')).toBe('C');
    expect(detectLanguage('test.cpp')).toBe('C++');
    expect(detectLanguage('test.java')).toBe('Java');
    expect(detectLanguage('test.rb')).toBe('Ruby');
    expect(detectLanguage('test.html')).toBe('HTML');
    expect(detectLanguage('test.css')).toBe('CSS');
    expect(detectLanguage('test.json')).toBe('JSON');
    expect(detectLanguage('test.md')).toBe('Markdown');
    expect(detectLanguage('test.sh')).toBe('Shell');
    expect(detectLanguage('test.yaml')).toBe('YAML');
    expect(detectLanguage('test.yml')).toBe('YAML');
    expect(detectLanguage('noext')).toBe('code');
  });

  test('FIM context with explicit language', () => {
    const ctxWithLang: FIMContext = {
      prefix: 'fn main() {',
      suffix: '}',
      filePath: 'main.rs',
      language: 'Rust',
    };
    // Language hint doesn't override — but prompt should work either way
    const result = formatAnthropicFIM(ctxWithLang);
    expect(result.prompt).toContain('Rust');
  });
});

// =============================================================================
// CompletionDebouncer
// =============================================================================

describe('CompletionDebouncer', () => {
  test('default delay is 300ms', () => {
    const d = new CompletionDebouncer();
    expect(d.delay).toBe(300);
  });

  test('custom delay', () => {
    const d = new CompletionDebouncer({ delay: 500 });
    expect(d.delay).toBe(500);
  });

  test('starts not pending', () => {
    const d = new CompletionDebouncer();
    expect(d.isPending).toBe(false);
    expect(d.requestId).toBe(0);
  });

  test('schedule makes it pending and increments requestId', () => {
    const d = new CompletionDebouncer({ delay: 10000 });
    const id = d.schedule(() => {});
    expect(d.isPending).toBe(true);
    expect(id).toBe(1);
    d.cancel();
  });

  test('cancel clears pending', () => {
    const d = new CompletionDebouncer({ delay: 10000 });
    d.schedule(() => {});
    d.cancel();
    expect(d.isPending).toBe(false);
  });

  test('isStale detects old request IDs', () => {
    const d = new CompletionDebouncer({ delay: 10000 });
    const id1 = d.schedule(() => {});
    expect(d.isStale(id1)).toBe(false);
    const id2 = d.schedule(() => {});
    expect(d.isStale(id1)).toBe(true);
    expect(d.isStale(id2)).toBe(false);
    d.cancel();
  });

  test('complete clears pending', () => {
    const d = new CompletionDebouncer({ delay: 10000 });
    d.schedule(() => {});
    d.complete();
    expect(d.isPending).toBe(false);
    d.cancel();
  });

  test('rapid schedules only keep latest', () => {
    const d = new CompletionDebouncer({ delay: 10000 });
    d.schedule(() => {});
    d.schedule(() => {});
    const id3 = d.schedule(() => {});
    expect(d.requestId).toBe(3);
    expect(d.isStale(1)).toBe(true);
    expect(d.isStale(2)).toBe(true);
    expect(d.isStale(id3)).toBe(false);
    d.cancel();
  });
});

// =============================================================================
// CompletionCache
// =============================================================================

describe('CompletionCache', () => {
  let cache: CompletionCache;

  beforeEach(() => {
    cache = new CompletionCache(5, 60_000);
  });

  test('starts empty', () => {
    expect(cache.size).toBe(0);
  });

  test('set and get', () => {
    const key = CompletionCache.buildKey('prefix', 'suffix');
    cache.set(key, 'hello world', 'claude-sonnet');
    expect(cache.size).toBe(1);
    const entry = cache.get(key);
    expect(entry).not.toBeNull();
    expect(entry!.completion).toBe('hello world');
    expect(entry!.modelId).toBe('claude-sonnet');
  });

  test('get returns null for missing key', () => {
    expect(cache.get('nonexistent')).toBeNull();
  });

  test('evicts oldest when over capacity', () => {
    for (let i = 0; i < 7; i++) {
      cache.set(`key${i}`, `val${i}`, 'model');
    }
    expect(cache.size).toBe(5);
    // Oldest keys (0, 1) should be evicted
    expect(cache.get('key0')).toBeNull();
    expect(cache.get('key1')).toBeNull();
    // Newest should exist
    expect(cache.get('key6')).not.toBeNull();
  });

  test('get moves entry to front (LRU)', () => {
    cache.set('a', 'va', 'm');
    cache.set('b', 'vb', 'm');
    cache.set('c', 'vc', 'm');
    // Access 'a' to move it to front
    cache.get('a');
    // Fill to capacity and beyond
    cache.set('d', 'vd', 'm');
    cache.set('e', 've', 'm');
    cache.set('f', 'vf', 'm');
    // 'a' should still exist (was recently used)
    expect(cache.get('a')).not.toBeNull();
    // 'b' should be evicted (least recently used)
    expect(cache.get('b')).toBeNull();
  });

  test('clear removes all entries', () => {
    cache.set('a', 'va', 'm');
    cache.set('b', 'vb', 'm');
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeNull();
  });

  test('duplicate key updates entry', () => {
    const key = 'mykey';
    cache.set(key, 'old', 'm');
    cache.set(key, 'new', 'm');
    expect(cache.size).toBe(1);
    expect(cache.get(key)!.completion).toBe('new');
  });

  test('buildKey combines prefix and suffix', () => {
    const key = CompletionCache.buildKey('hello', 'world');
    expect(key).toContain('hello');
    expect(key).toContain('world');
    expect(key).toContain('\x00');
  });

  test('buildKey truncates long inputs', () => {
    const longPrefix = 'a'.repeat(500);
    const longSuffix = 'b'.repeat(300);
    const key = CompletionCache.buildKey(longPrefix, longSuffix);
    // Should use last 200 of prefix + first 100 of suffix + separator
    expect(key.length).toBe(301); // 200 + 1 + 100
  });

  test('buildKey with empty strings', () => {
    const key = CompletionCache.buildKey('', '');
    expect(key).toBe('\x00');
    expect(key.length).toBe(1);
  });

  test('prune removes expired entries', () => {
    // Create cache with very short TTL
    const shortCache = new CompletionCache(10, 1);
    shortCache.set('old1', 'val1', 'm');
    shortCache.set('old2', 'val2', 'm');
    // Wait a tiny bit for TTL to expire (1ms)
    const start = Date.now();
    while (Date.now() - start < 5) { /* spin */ }
    const removed = shortCache.prune();
    expect(removed).toBe(2);
    expect(shortCache.size).toBe(0);
  });

  test('get returns null for expired entry', () => {
    const shortCache = new CompletionCache(10, 1);
    shortCache.set('key', 'val', 'm');
    const start = Date.now();
    while (Date.now() - start < 5) { /* spin */ }
    expect(shortCache.get('key')).toBeNull();
    expect(shortCache.size).toBe(0); // expired entry was removed
  });
});

// =============================================================================
// InlineCompletionProvider
// =============================================================================

describe('InlineCompletionProvider', () => {
  let provider: InlineCompletionProvider;

  beforeEach(() => {
    provider = new InlineCompletionProvider({ debounceDelay: 10 });
  });

  test('starts idle', () => {
    const state = provider.getState();
    expect(state.status).toBe('idle');
    expect(state.ghostText).toBe('');
  });

  test('getConfig returns config', () => {
    const config = provider.getConfig();
    expect(config.debounceDelay).toBe(10);
    expect(config.enabled).toBe(true);
  });

  test('updateConfig changes settings', () => {
    provider.updateConfig({ maxCompletionLength: 1000 });
    expect(provider.getConfig().maxCompletionLength).toBe(1000);
  });

  test('requestCompletion returns prompt on cache miss', () => {
    const ctx: FIMContext = { prefix: 'fn main() {', suffix: '}', filePath: 'main.rs' };
    const result = provider.requestCompletion(ctx, 'anthropic', 'claude-sonnet-4-6');
    expect(result.fromCache).toBe(false);
    expect(result.prompt).not.toBeNull();
    expect(result.prompt!).toContain('<CURSOR>');
  });

  test('requestCompletion returns null when disabled', () => {
    provider.updateConfig({ enabled: false });
    const ctx: FIMContext = { prefix: 'x', suffix: 'y', filePath: 'a.ts' };
    const result = provider.requestCompletion(ctx, 'anthropic', 'model');
    expect(result.prompt).toBeNull();
    expect(result.completion).toBeNull();
  });

  test('onCompletionReceived stores and shows ghost text', () => {
    const ctx: FIMContext = { prefix: 'hello ', suffix: '', filePath: 'a.ts' };
    provider.requestCompletion(ctx, 'anthropic', 'model');
    const reqId = provider.scheduleRequest(() => {});

    const accepted = provider.onCompletionReceived('world', reqId);
    expect(accepted).toBe(true);

    const state = provider.getState();
    expect(state.ghostText).toBe('world');
    expect(state.status).toBe('showing');
  });

  test('onCompletionReceived rejects stale responses', () => {
    const ctx: FIMContext = { prefix: 'a', suffix: 'b', filePath: 'x.ts' };
    provider.requestCompletion(ctx, 'anthropic', 'model');
    const id1 = provider.scheduleRequest(() => {});
    // New request comes in, making id1 stale
    provider.scheduleRequest(() => {});

    const accepted = provider.onCompletionReceived('stale', id1);
    expect(accepted).toBe(false);
    provider.cancelPending();
  });

  test('onCompletionReceived truncates long completions', () => {
    provider = new InlineCompletionProvider({ debounceDelay: 10, maxCompletionLength: 20 });
    const ctx: FIMContext = { prefix: 'x', suffix: 'y', filePath: 'a.ts' };
    provider.requestCompletion(ctx, 'anthropic', 'model');
    const reqId = provider.scheduleRequest(() => {});

    provider.onCompletionReceived('a'.repeat(100), reqId);
    expect(provider.getState().ghostText.length).toBe(20);
  });

  test('acceptFull returns ghost text and resets', () => {
    const ctx: FIMContext = { prefix: 'x', suffix: '', filePath: 'a.ts' };
    provider.requestCompletion(ctx, 'anthropic', 'model');
    const reqId = provider.scheduleRequest(() => {});
    provider.onCompletionReceived('hello world', reqId);

    const text = provider.acceptFull();
    expect(text).toBe('hello world');
    expect(provider.getState().status).toBe('idle');
    expect(provider.getState().ghostText).toBe('');
  });

  test('acceptWord returns first word', () => {
    const ctx: FIMContext = { prefix: 'x', suffix: '', filePath: 'a.ts' };
    provider.requestCompletion(ctx, 'anthropic', 'model');
    const reqId = provider.scheduleRequest(() => {});
    provider.onCompletionReceived('hello world done', reqId);

    const word1 = provider.acceptWord();
    expect(word1).toBe('hello ');
    expect(provider.getRemainingGhostText()).toBe('world done');

    const word2 = provider.acceptWord();
    expect(word2).toBe('world ');
    expect(provider.getRemainingGhostText()).toBe('done');
  });

  test('acceptWord accepts final word and resets', () => {
    const ctx: FIMContext = { prefix: 'x', suffix: '', filePath: 'a.ts' };
    provider.requestCompletion(ctx, 'anthropic', 'model');
    const reqId = provider.scheduleRequest(() => {});
    provider.onCompletionReceived('end', reqId);

    const word = provider.acceptWord();
    expect(word).toBe('end');
    expect(provider.getState().status).toBe('idle');
  });

  test('dismiss clears ghost text', () => {
    const ctx: FIMContext = { prefix: 'x', suffix: '', filePath: 'a.ts' };
    provider.requestCompletion(ctx, 'anthropic', 'model');
    const reqId = provider.scheduleRequest(() => {});
    provider.onCompletionReceived('hello', reqId);
    provider.dismiss();

    expect(provider.getState().ghostText).toBe('');
    expect(provider.getState().status).toBe('idle');
  });

  test('cache hit on repeated request', () => {
    const ctx: FIMContext = { prefix: 'const x = ', suffix: ';', filePath: 'a.ts' };
    provider.requestCompletion(ctx, 'anthropic', 'model');
    const reqId = provider.scheduleRequest(() => {});
    provider.onCompletionReceived('42', reqId);
    provider.dismiss();

    // Same context again — should hit cache
    const result = provider.requestCompletion(ctx, 'anthropic', 'model');
    expect(result.fromCache).toBe(true);
    expect(result.completion).toBe('42');
  });

  test('clearCache empties cache', () => {
    const ctx: FIMContext = { prefix: 'x', suffix: '', filePath: 'a.ts' };
    provider.requestCompletion(ctx, 'anthropic', 'model');
    const reqId = provider.scheduleRequest(() => {});
    provider.onCompletionReceived('cached', reqId);
    expect(provider.getCacheSize()).toBe(1);

    provider.clearCache();
    expect(provider.getCacheSize()).toBe(0);
  });

  test('cancelPending stops debounce', () => {
    const ctx: FIMContext = { prefix: 'x', suffix: '', filePath: 'a.ts' };
    provider.requestCompletion(ctx, 'anthropic', 'model');
    provider.scheduleRequest(() => {});
    expect(provider.getState().status).toBe('debouncing');

    provider.cancelPending();
    expect(provider.getState().status).toBe('idle');
  });

  test('onError sets error status', () => {
    provider.onError();
    expect(provider.getState().status).toBe('error');
  });

  test('acceptFull returns empty when no ghost text', () => {
    expect(provider.acceptFull()).toBe('');
  });

  test('acceptWord returns empty when no ghost text', () => {
    expect(provider.acceptWord()).toBe('');
  });
});
