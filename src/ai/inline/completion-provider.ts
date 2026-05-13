/**
 * Inline completion provider — orchestrates FIM formatting,
 * debouncing, caching, and request lifecycle.
 */

import type { FIMContext } from './fim-adapter';
import { getFIMFormatter } from './fim-adapter';
import { CompletionDebouncer } from './debouncer';
import { CompletionCache } from './cache';

export type CompletionStatus = 'idle' | 'debouncing' | 'loading' | 'showing' | 'error';

export interface CompletionState {
  /** Current ghost text (empty = no completion) */
  ghostText: string;
  /** How much of the ghost text has been accepted (for word-by-word) */
  acceptedLength: number;
  /** Current status for UI indicators */
  status: CompletionStatus;
  /** Current provider+model being used */
  providerId: string;
  modelId: string;
}

export interface CompletionProviderConfig {
  /** Debounce delay in ms (default 300) */
  debounceDelay: number;
  /** Max completion length in characters (default 500) */
  maxCompletionLength: number;
  /** Cache capacity (default 50) */
  cacheSize: number;
  /** Cache TTL in ms (default 5 min) */
  cacheTTL: number;
  /** Whether inline completions are enabled */
  enabled: boolean;
}

const DEFAULT_CONFIG: CompletionProviderConfig = {
  debounceDelay: 300,
  maxCompletionLength: 500,
  cacheSize: 50,
  cacheTTL: 300_000,
  enabled: true,
};

export class InlineCompletionProvider {
  private debouncer: CompletionDebouncer;
  private cache: CompletionCache;
  private config: CompletionProviderConfig;
  private state: CompletionState;

  /** Last context used (for cache key) */
  private lastPrefix = '';
  private lastSuffix = '';

  constructor(config?: Partial<CompletionProviderConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.debouncer = new CompletionDebouncer({ delay: this.config.debounceDelay });
    this.cache = new CompletionCache(this.config.cacheSize, this.config.cacheTTL);
    this.state = {
      ghostText: '',
      acceptedLength: 0,
      status: 'idle',
      providerId: '',
      modelId: '',
    };
  }

  /** Get the current completion state. */
  getState(): CompletionState {
    return { ...this.state };
  }

  /** Get the current config. */
  getConfig(): CompletionProviderConfig {
    return { ...this.config };
  }

  /** Update config at runtime. */
  updateConfig(patch: Partial<CompletionProviderConfig>): void {
    if (patch.debounceDelay !== undefined) {
      this.config.debounceDelay = patch.debounceDelay;
      // Recreate debouncer with new delay
      this.debouncer = new CompletionDebouncer({ delay: patch.debounceDelay });
    }
    if (patch.maxCompletionLength !== undefined) this.config.maxCompletionLength = patch.maxCompletionLength;
    if (patch.cacheSize !== undefined) this.config.cacheSize = patch.cacheSize;
    if (patch.cacheTTL !== undefined) this.config.cacheTTL = patch.cacheTTL;
    if (patch.enabled !== undefined) this.config.enabled = patch.enabled;
  }

  /**
   * Request a completion for the given cursor context.
   * Returns the formatted prompt (caller is responsible for sending to AI).
   * Checks cache first; if miss, debounces and returns null (call again later).
   */
  requestCompletion(
    ctx: FIMContext,
    providerId: string,
    modelId: string,
  ): { fromCache: boolean; completion: string | null; prompt: string | null } {
    if (!this.config.enabled) {
      return { fromCache: false, completion: null, prompt: null };
    }

    this.state.providerId = providerId;
    this.state.modelId = modelId;
    this.lastPrefix = ctx.prefix;
    this.lastSuffix = ctx.suffix;

    // Check cache
    const cacheKey = CompletionCache.buildKey(ctx.prefix, ctx.suffix);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.state.ghostText = cached.completion;
      this.state.acceptedLength = 0;
      this.state.status = 'showing';
      return { fromCache: true, completion: cached.completion, prompt: null };
    }

    // Format the prompt
    const formatter = getFIMFormatter(providerId);
    const fimReq = formatter(ctx);

    this.state.status = 'debouncing';
    return { fromCache: false, completion: null, prompt: fimReq.prompt };
  }

  /**
   * Called when a completion response arrives from the AI.
   * Stores in cache and updates state.
   */
  onCompletionReceived(completion: string, requestId: number): boolean {
    // Check if this response is stale
    if (this.debouncer.isStale(requestId)) {
      return false;
    }

    // Truncate if too long
    let text = completion;
    if (text.length > this.config.maxCompletionLength) {
      text = text.slice(0, this.config.maxCompletionLength);
    }

    // Trim trailing whitespace-only lines
    while (text.endsWith('\n\n')) {
      text = text.slice(0, text.length - 1);
    }

    // Cache it
    const cacheKey = CompletionCache.buildKey(this.lastPrefix, this.lastSuffix);
    this.cache.set(cacheKey, text, this.state.modelId);

    // Update state
    this.state.ghostText = text;
    this.state.acceptedLength = 0;
    this.state.status = 'showing';
    this.debouncer.complete();

    return true;
  }

  /** Accept the full ghost text. Returns the text to insert. */
  acceptFull(): string {
    if (this.state.ghostText.length === 0) return '';
    const text = this.state.ghostText.slice(this.state.acceptedLength);
    this.state.ghostText = '';
    this.state.acceptedLength = 0;
    this.state.status = 'idle';
    return text;
  }

  /**
   * Accept the next word of ghost text. Returns the text to insert.
   * A "word" is defined as: contiguous non-whitespace, then contiguous whitespace.
   */
  acceptWord(): string {
    const ghost = this.state.ghostText;
    if (ghost.length === 0) return '';
    let pos = this.state.acceptedLength;
    if (pos >= ghost.length) {
      this.dismiss();
      return '';
    }

    const start = pos;
    // Skip non-whitespace
    while (pos < ghost.length && ghost.charCodeAt(pos) !== 32 && ghost.charCodeAt(pos) !== 10 && ghost.charCodeAt(pos) !== 9) {
      pos++;
    }
    // Skip whitespace
    while (pos < ghost.length && (ghost.charCodeAt(pos) === 32 || ghost.charCodeAt(pos) === 10 || ghost.charCodeAt(pos) === 9)) {
      pos++;
    }

    // If we reached the end, accept full
    if (pos >= ghost.length) {
      const text = ghost.slice(start);
      this.state.ghostText = '';
      this.state.acceptedLength = 0;
      this.state.status = 'idle';
      return text;
    }

    this.state.acceptedLength = pos;
    return ghost.slice(start, pos);
  }

  /** Dismiss the current ghost text. */
  dismiss(): void {
    this.state.ghostText = '';
    this.state.acceptedLength = 0;
    this.state.status = 'idle';
    this.debouncer.cancel();
  }

  /** Get remaining ghost text (not yet accepted). */
  getRemainingGhostText(): string {
    if (this.state.ghostText.length === 0) return '';
    return this.state.ghostText.slice(this.state.acceptedLength);
  }

  /** Cancel any pending request. */
  cancelPending(): void {
    this.debouncer.cancel();
    if (this.state.status === 'debouncing' || this.state.status === 'loading') {
      this.state.status = 'idle';
    }
  }

  /** Start the debounce schedule. Returns the request ID. */
  scheduleRequest(callback: () => void): number {
    this.state.status = 'debouncing';
    return this.debouncer.schedule(() => {
      this.state.status = 'loading';
      callback();
    });
  }

  /** Mark a request as errored. */
  onError(): void {
    this.state.status = 'error';
    this.debouncer.complete();
  }

  /** Clear the cache. */
  clearCache(): void {
    this.cache.clear();
  }

  /** Get cache stats. */
  getCacheSize(): number {
    return this.cache.size;
  }

  /** Prune expired cache entries. */
  pruneCache(): number {
    return this.cache.prune();
  }
}
