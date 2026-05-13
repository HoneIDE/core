/**
 * Breakpoint manager — tracks breakpoints across files.
 */
import type { SourceBreakpoint, Breakpoint, Source } from './dap-types';

export interface FileBreakpoints {
  path: string;
  breakpoints: ManagedBreakpoint[];
}

export interface ManagedBreakpoint {
  id: number;
  line: number;
  column?: number;
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
  verified: boolean;
}

export class BreakpointManager {
  private nextId = 1;
  private fileMap = new Map<string, ManagedBreakpoint[]>();

  /** Set breakpoints for a file (replaces all breakpoints for that file). */
  setBreakpoints(path: string, breakpoints: SourceBreakpoint[]): ManagedBreakpoint[] {
    const managed: ManagedBreakpoint[] = breakpoints.map(bp => ({
      id: this.nextId++,
      line: bp.line,
      column: bp.column,
      condition: bp.condition,
      hitCondition: bp.hitCondition,
      logMessage: bp.logMessage,
      verified: false,  // unverified until DAP confirms
    }));
    this.fileMap.set(path, managed);
    return managed;
  }

  /** Get breakpoints for a specific file. */
  getBreakpoints(path: string): ManagedBreakpoint[] {
    return this.fileMap.get(path) ?? [];
  }

  /** Get all breakpoints across all files. */
  getAllBreakpoints(): FileBreakpoints[] {
    const result: FileBreakpoints[] = [];
    for (const [path, bps] of this.fileMap) {
      if (bps.length > 0) {
        result.push({ path, breakpoints: bps });
      }
    }
    return result;
  }

  /** Toggle a breakpoint at a specific line in a file. */
  toggleBreakpoint(path: string, line: number): ManagedBreakpoint[] {
    const existing = this.fileMap.get(path) ?? [];
    const idx = existing.findIndex(bp => bp.line === line);

    if (idx >= 0) {
      // Remove existing breakpoint at this line
      existing.splice(idx, 1);
    } else {
      // Add new breakpoint
      existing.push({
        id: this.nextId++,
        line,
        verified: false,
      });
    }

    this.fileMap.set(path, existing);
    return existing;
  }

  /** Remove all breakpoints for a file. */
  clearFile(path: string): void {
    this.fileMap.delete(path);
  }

  /** Remove all breakpoints. */
  clearAll(): void {
    this.fileMap.clear();
    this.nextId = 1;
  }

  /** Update verification status from DAP response. */
  updateVerification(path: string, dapBreakpoints: Breakpoint[]): void {
    const managed = this.fileMap.get(path);
    if (!managed) return;

    for (let i = 0; i < managed.length && i < dapBreakpoints.length; i++) {
      managed[i].verified = dapBreakpoints[i].verified;
      if (dapBreakpoints[i].line !== undefined) {
        managed[i].line = dapBreakpoints[i].line!;
      }
    }
  }

  /** Count total breakpoints. */
  count(): number {
    let total = 0;
    for (const bps of this.fileMap.values()) {
      total += bps.length;
    }
    return total;
  }

  /** Check if a line has a breakpoint. */
  hasBreakpoint(path: string, line: number): boolean {
    const bps = this.fileMap.get(path);
    if (!bps) return false;
    return bps.some(bp => bp.line === line);
  }

  /** Convert to DAP SetBreakpointsArguments format. */
  toSetBreakpointsArgs(path: string): { source: Source; breakpoints: SourceBreakpoint[] } {
    const bps = this.fileMap.get(path) ?? [];
    return {
      source: { path },
      breakpoints: bps.map(bp => {
        const sbp: SourceBreakpoint = { line: bp.line };
        if (bp.column !== undefined) sbp.column = bp.column;
        if (bp.condition) sbp.condition = bp.condition;
        if (bp.hitCondition) sbp.hitCondition = bp.hitCondition;
        if (bp.logMessage) sbp.logMessage = bp.logMessage;
        return sbp;
      }),
    };
  }
}
