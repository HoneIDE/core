/**
 * LSP Server Manager — manages lifecycle of language servers.
 */
export interface ServerConfig {
  languageId: string;
  command: string;
  args: string[];
  rootUri: string;
  initializationOptions?: Record<string, unknown>;
}

export interface ManagedServer {
  languageId: string;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'crashed';
  capabilities: Record<string, unknown> | null;
  restartCount: number;
}

export class LspManager {
  private servers: Map<string, ManagedServer> = new Map();
  private maxRestarts = 3;

  getServer(languageId: string): ManagedServer | undefined {
    return this.servers.get(languageId);
  }

  getAllServers(): ManagedServer[] {
    return Array.from(this.servers.values());
  }

  registerServer(config: ServerConfig): ManagedServer {
    const server: ManagedServer = {
      languageId: config.languageId,
      status: 'starting',
      capabilities: null,
      restartCount: 0,
    };
    this.servers.set(config.languageId, server);
    return server;
  }

  markRunning(languageId: string, capabilities: Record<string, unknown>): void {
    const server = this.servers.get(languageId);
    if (server) {
      server.status = 'running';
      server.capabilities = capabilities;
    }
  }

  markStopped(languageId: string): void {
    const server = this.servers.get(languageId);
    if (server) {
      server.status = 'stopped';
    }
  }

  markCrashed(languageId: string): boolean {
    const server = this.servers.get(languageId);
    if (!server) return false;
    server.restartCount++;
    if (server.restartCount > this.maxRestarts) {
      server.status = 'crashed';
      return false; // don't restart
    }
    server.status = 'starting';
    return true; // should restart
  }

  removeServer(languageId: string): void {
    this.servers.delete(languageId);
  }

  hasServer(languageId: string): boolean {
    return this.servers.has(languageId);
  }

  setMaxRestarts(n: number): void {
    this.maxRestarts = n;
  }
}
