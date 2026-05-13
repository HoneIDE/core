/**
 * DAP Manager — manages debug adapter lifecycle.
 */
export interface DebugConfig {
  type: string;
  name: string;
  request: 'launch' | 'attach';
  program?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  port?: number;
}

export interface ManagedDebugSession {
  id: string;
  config: DebugConfig;
  status: 'initializing' | 'running' | 'paused' | 'stopped';
  threadIds: number[];
  activeThreadId: number | null;
}

let nextSessionId = 1;
export function resetDapManagerIds(): void { nextSessionId = 1; }

export class DapManager {
  private sessions: Map<string, ManagedDebugSession> = new Map();

  createSession(config: DebugConfig): ManagedDebugSession {
    const id = `debug-${nextSessionId++}`;
    const session: ManagedDebugSession = {
      id,
      config,
      status: 'initializing',
      threadIds: [],
      activeThreadId: null,
    };
    this.sessions.set(id, session);
    return session;
  }

  getSession(id: string): ManagedDebugSession | undefined {
    return this.sessions.get(id);
  }

  getAllSessions(): ManagedDebugSession[] {
    return Array.from(this.sessions.values());
  }

  markRunning(id: string): void {
    const s = this.sessions.get(id);
    if (s) s.status = 'running';
  }

  markPaused(id: string, threadId: number): void {
    const s = this.sessions.get(id);
    if (s) {
      s.status = 'paused';
      s.activeThreadId = threadId;
    }
  }

  markStopped(id: string): void {
    const s = this.sessions.get(id);
    if (s) s.status = 'stopped';
  }

  updateThreads(id: string, threadIds: number[]): void {
    const s = this.sessions.get(id);
    if (s) s.threadIds = threadIds;
  }

  removeSession(id: string): void {
    this.sessions.delete(id);
  }

  hasActiveSession(): boolean {
    for (const s of this.sessions.values()) {
      if (s.status === 'running' || s.status === 'paused') return true;
    }
    return false;
  }
}
