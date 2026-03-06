/**
 * Per-source trust level configuration.
 * Determines how change proposals from specific sources are handled.
 */

export type TrustLevel = 'review' | 'auto-accept-clean' | 'auto-accept-all' | 'block';

export interface TrustEntry {
  sourceId: string;
  level: TrustLevel;
  updatedAt: number;
}

export class TrustConfig {
  private entries: TrustEntry[] = [];
  private defaultLevel: TrustLevel = 'review';

  /** Set the default trust level for unknown sources. */
  setDefaultLevel(level: TrustLevel): void {
    this.defaultLevel = level;
  }

  /** Get the default trust level. */
  getDefaultLevel(): TrustLevel {
    return this.defaultLevel;
  }

  /** Set trust level for a specific source. */
  setTrust(sourceId: string, level: TrustLevel): void {
    for (let i = 0; i < this.entries.length; i++) {
      if (this.entries[i].sourceId === sourceId) {
        this.entries[i].level = level;
        this.entries[i].updatedAt = Date.now();
        return;
      }
    }
    this.entries.push({ sourceId, level, updatedAt: Date.now() });
  }

  /** Get trust level for a source. Returns default if not configured. */
  getTrust(sourceId: string): TrustLevel {
    for (let i = 0; i < this.entries.length; i++) {
      if (this.entries[i].sourceId === sourceId) {
        return this.entries[i].level;
      }
    }
    return this.defaultLevel;
  }

  /** Remove trust entry for a source (falls back to default). */
  removeTrust(sourceId: string): boolean {
    for (let i = 0; i < this.entries.length; i++) {
      if (this.entries[i].sourceId === sourceId) {
        this.entries.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  /** Get all configured trust entries. */
  getAllEntries(): TrustEntry[] {
    return this.entries.slice();
  }

  /** Check if a proposal should be auto-accepted based on trust level and conflict state. */
  shouldAutoAccept(sourceId: string, isClean: boolean): boolean {
    const level = this.getTrust(sourceId);
    if (level === 'auto-accept-all') return true;
    if (level === 'auto-accept-clean' && isClean) return true;
    return false;
  }

  /** Check if a source is blocked. */
  isBlocked(sourceId: string): boolean {
    return this.getTrust(sourceId) === 'block';
  }
}
