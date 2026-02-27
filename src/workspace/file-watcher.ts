/**
 * File system watcher — watches workspace folders for changes.
 *
 * Uses Node.js fs.watch (which maps to platform-native APIs:
 * FSEvents on macOS, inotify on Linux, ReadDirectoryChangesW on Windows).
 *
 * Features:
 * - Debounces rapid changes (e.g. build tools writing many files)
 * - Coalesces events per path
 * - Respects workspace ignore patterns
 * - Supports watching multiple roots
 */

import { watch, type FSWatcher } from 'node:fs';
import { join, relative } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FileChangeType = 'created' | 'changed' | 'deleted';

export interface FileChangeEvent {
  path: string;
  relativePath: string;
  type: FileChangeType;
}

export type FileChangeListener = (events: FileChangeEvent[]) => void;

export interface FileWatcherOptions {
  /** Debounce interval in ms. Default 100ms. */
  debounceMs?: number;
  /** Function to check if a filename should be ignored. */
  shouldIgnore?: (name: string) => boolean;
}

// ---------------------------------------------------------------------------
// FileWatcher
// ---------------------------------------------------------------------------

export class FileWatcher {
  private _watchers: Map<string, FSWatcher> = new Map();
  private _listeners: Set<FileChangeListener> = new Set();
  private _debounceMs: number;
  private _shouldIgnore: (name: string) => boolean;

  // Pending events accumulate during the debounce window
  private _pending: Map<string, FileChangeEvent> = new Map();
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options?: FileWatcherOptions) {
    this._debounceMs = options?.debounceMs ?? 100;
    this._shouldIgnore = options?.shouldIgnore ?? (() => false);
  }

  // -----------------------------------------------------------------------
  // Watch management
  // -----------------------------------------------------------------------

  /**
   * Start watching a directory recursively.
   */
  watchDirectory(rootPath: string): void {
    if (this._watchers.has(rootPath)) return;

    try {
      const watcher = watch(rootPath, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        if (this._shouldIgnore(filename.split('/')[0])) return;

        const fullPath = join(rootPath, filename);
        const changeType: FileChangeType = eventType === 'rename' ? 'created' : 'changed';

        this._queueEvent({
          path: fullPath,
          relativePath: filename,
          type: changeType,
        });
      });

      this._watchers.set(rootPath, watcher);
    } catch (err) {
      // Watch may fail on some platforms/paths — log but don't crash
      console.warn(`Failed to watch ${rootPath}:`, err);
    }
  }

  /**
   * Stop watching a directory.
   */
  unwatchDirectory(rootPath: string): void {
    const watcher = this._watchers.get(rootPath);
    if (watcher) {
      watcher.close();
      this._watchers.delete(rootPath);
    }
  }

  /**
   * Stop all watchers and clear pending events.
   */
  dispose(): void {
    for (const [path, watcher] of this._watchers) {
      watcher.close();
    }
    this._watchers.clear();
    this._clearDebounce();
    this._pending.clear();
  }

  /**
   * Number of active watchers.
   */
  get watcherCount(): number {
    return this._watchers.size;
  }

  /**
   * Whether a directory is being watched.
   */
  isWatching(rootPath: string): boolean {
    return this._watchers.has(rootPath);
  }

  // -----------------------------------------------------------------------
  // Event debouncing
  // -----------------------------------------------------------------------

  private _queueEvent(event: FileChangeEvent): void {
    // Coalesce: last event for a given path wins
    this._pending.set(event.path, event);

    // Reset the debounce timer
    this._clearDebounce();
    this._debounceTimer = setTimeout(() => {
      this._flush();
    }, this._debounceMs);
  }

  /**
   * Flush pending events immediately (useful for testing).
   */
  flush(): void {
    this._flush();
  }

  private _flush(): void {
    this._clearDebounce();

    if (this._pending.size === 0) return;

    const events = Array.from(this._pending.values());
    this._pending.clear();

    for (const listener of this._listeners) {
      listener(events);
    }
  }

  private _clearDebounce(): void {
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
  }

  /**
   * Manually inject a change event (for testing or platform-specific integrations).
   */
  injectEvent(event: FileChangeEvent): void {
    this._queueEvent(event);
  }

  // -----------------------------------------------------------------------
  // Listeners
  // -----------------------------------------------------------------------

  onChange(listener: FileChangeListener): () => void {
    this._listeners.add(listener);
    return () => { this._listeners.delete(listener); };
  }
}
