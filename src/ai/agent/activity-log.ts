/**
 * Activity log for agent operations — full transparency.
 */

export type ActivityType =
  | 'thinking'
  | 'tool_call'
  | 'tool_result'
  | 'approval_requested'
  | 'approval_granted'
  | 'approval_denied'
  | 'error'
  | 'message'
  | 'plan_step';

export interface ActivityEntry {
  id: number;
  type: ActivityType;
  timestamp: number;
  /** Tool name (for tool_call/tool_result) */
  toolName?: string;
  /** Human-readable summary */
  summary: string;
  /** Full details (tool args, result, etc.) */
  details: string;
  /** Duration in ms (for tool_call entries) */
  durationMs?: number;
}

let nextEntryId = 1;

export class ActivityLog {
  private entries: ActivityEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries = 1000) {
    this.maxEntries = maxEntries;
  }

  /** Add an entry. */
  add(type: ActivityType, summary: string, details = '', toolName?: string): ActivityEntry {
    const entry: ActivityEntry = {
      id: nextEntryId++,
      type,
      timestamp: Date.now(),
      summary,
      details,
      toolName,
    };
    this.entries.push(entry);

    // Evict oldest if over limit
    while (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    return entry;
  }

  /** Update an entry's duration. */
  setDuration(id: number, durationMs: number): boolean {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i].id === id) {
        this.entries[i].durationMs = durationMs;
        return true;
      }
    }
    return false;
  }

  /** Get all entries. */
  getAll(): ActivityEntry[] {
    return this.entries.slice();
  }

  /** Get the last N entries. */
  getLast(n: number): ActivityEntry[] {
    if (n >= this.entries.length) return this.entries.slice();
    return this.entries.slice(this.entries.length - n);
  }

  /** Get entries by type. */
  getByType(type: ActivityType): ActivityEntry[] {
    const result: ActivityEntry[] = [];
    for (let i = 0; i < this.entries.length; i++) {
      if (this.entries[i].type === type) result.push(this.entries[i]);
    }
    return result;
  }

  /** Get entry count. */
  get count(): number {
    return this.entries.length;
  }

  /** Clear all entries. */
  clear(): void {
    this.entries.length = 0;
  }

  /** Get a summary string for the last N entries. */
  formatSummary(n = 10): string {
    const recent = this.getLast(n);
    const lines: string[] = [];
    for (let i = 0; i < recent.length; i++) {
      const e = recent[i];
      let line = `[${e.type}] ${e.summary}`;
      if (e.durationMs !== undefined) {
        line += ` (${e.durationMs}ms)`;
      }
      lines.push(line);
    }
    return lines.join('\n');
  }
}

/** Reset entry ID counter (for testing). */
export function resetActivityIds(): void {
  nextEntryId = 1;
}
