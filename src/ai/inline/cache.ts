/**
 * LRU completion cache for inline completions.
 *
 * Caches completions keyed by (prefix hash + suffix hash) so that
 * if the user types, undoes, and retypes, we can serve from cache.
 */

export interface CacheEntry {
  /** The completion text */
  completion: string;
  /** Timestamp when cached */
  timestamp: number;
  /** The model that generated this */
  modelId: string;
}

export class CompletionCache {
  private entries: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private ttlMs: number;

  /**
   * @param maxSize Maximum number of entries (default 50)
   * @param ttlMs Time-to-live in ms (default 5 minutes)
   */
  constructor(maxSize = 50, ttlMs = 300_000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  /** Build a cache key from prefix and suffix. */
  static buildKey(prefix: string, suffix: string): string {
    // Use last 200 chars of prefix + first 100 chars of suffix
    const p = prefix.length > 200 ? prefix.slice(prefix.length - 200) : prefix;
    const s = suffix.length > 100 ? suffix.slice(0, 100) : suffix;
    return p + '\x00' + s;
  }

  /** Look up a cached completion. Returns null if not found or expired. */
  get(key: string): CacheEntry | null {
    const entry = this.entries.get(key);
    if (entry === undefined) return null;

    const now = Date.now();
    // Check TTL
    if (now - entry.timestamp > this.ttlMs) {
      // Expired — remove
      this.entries.delete(key);
      return null;
    }
    // Move to end (most recently used) — delete and re-insert
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry;
  }

  /** Store a completion in the cache. */
  set(key: string, completion: string, modelId: string): void {
    const entry: CacheEntry = {
      completion,
      timestamp: Date.now(),
      modelId,
    };

    // Delete if exists (so re-insert moves to end)
    this.entries.delete(key);
    this.entries.set(key, entry);

    // Evict oldest (first entry) if over capacity
    while (this.entries.size > this.maxSize) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }
  }

  /** Remove all entries. */
  clear(): void {
    this.entries.clear();
  }

  /** Number of entries in cache. */
  get size(): number {
    return this.entries.size;
  }

  /** Remove expired entries. */
  prune(): number {
    const now = Date.now();
    let removed = 0;
    const keysToDelete: string[] = [];
    for (const [key, entry] of this.entries) {
      if (now - entry.timestamp > this.ttlMs) {
        keysToDelete.push(key);
      }
    }
    for (let i = 0; i < keysToDelete.length; i++) {
      this.entries.delete(keysToDelete[i]);
      removed++;
    }
    return removed;
  }
}
