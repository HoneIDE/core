/**
 * Decision history for the Changes Queue.
 * Tracks accepted/rejected proposals and supports undo via reverse diffs.
 */

export interface HistoryEntry {
  proposalId: string;
  action: 'accepted' | 'rejected' | 'undone';
  timestamp: number;
  reverseDiffs: Map<string, string>;  // path → reverse diff
}

export class QueueHistory {
  private entries: HistoryEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries: number = 100) {
    this.maxEntries = maxEntries;
  }

  /** Record a decision. */
  record(proposalId: string, action: 'accepted' | 'rejected', reverseDiffs?: Map<string, string>): void {
    this.entries.push({
      proposalId,
      action,
      timestamp: Date.now(),
      reverseDiffs: reverseDiffs ?? new Map(),
    });

    // Trim to max size
    while (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  /** Mark a proposal as undone in history. */
  markUndone(proposalId: string): boolean {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i].proposalId === proposalId && this.entries[i].action === 'accepted') {
        this.entries[i].action = 'undone';
        return true;
      }
    }
    return false;
  }

  /** Get the last N accepted entries (for undo). Returns most recent first. */
  getUndoable(count: number): HistoryEntry[] {
    const result: HistoryEntry[] = [];
    for (let i = this.entries.length - 1; i >= 0 && result.length < count; i--) {
      if (this.entries[i].action === 'accepted') {
        result.push(this.entries[i]);
      }
    }
    return result;
  }

  /** Get an entry by proposal ID. */
  getEntry(proposalId: string): HistoryEntry | null {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i].proposalId === proposalId) {
        return this.entries[i];
      }
    }
    return null;
  }

  /** Get all entries. */
  getAllEntries(): HistoryEntry[] {
    return this.entries.slice();
  }

  /** Get entry count. */
  get count(): number {
    return this.entries.length;
  }

  /** Clear all history. */
  clear(): void {
    this.entries.length = 0;
  }

  /** Set max entries (for config changes). */
  setMaxEntries(max: number): void {
    this.maxEntries = max;
    while (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }
}
