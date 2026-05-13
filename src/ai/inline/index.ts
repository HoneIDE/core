export { InlineCompletionProvider } from './completion-provider';
export type { CompletionState, CompletionStatus, CompletionProviderConfig } from './completion-provider';

export { CompletionDebouncer } from './debouncer';
export type { DebouncerOptions } from './debouncer';

export { CompletionCache } from './cache';
export type { CacheEntry } from './cache';

export {
  formatAnthropicFIM, formatOpenAIFIM, formatNativeFIM,
  getFIMFormatter, detectLanguage,
} from './fim-adapter';
export type { FIMContext, FIMRequest } from './fim-adapter';
