/**
 * LAN transport — direct WebSocket connection.
 */

import type { ITransport } from './transport';

export class LanTransport implements ITransport {
  private ws: WebSocket | null = null;
  private messageHandlers: Array<(data: string) => void> = [];
  private connectHandlers: Array<() => void> = [];
  private disconnectHandlers: Array<(reason: string) => void> = [];
  private connected: boolean = false;

  async connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.onopen = () => {
        this.ws = ws;
        this.connected = true;
        for (let i = 0; i < this.connectHandlers.length; i++) {
          this.connectHandlers[i]();
        }
        resolve();
      };
      ws.onmessage = (evt) => {
        const data = typeof evt.data === 'string' ? evt.data : String(evt.data);
        for (let i = 0; i < this.messageHandlers.length; i++) {
          this.messageHandlers[i](data);
        }
      };
      ws.onclose = (evt) => {
        this.connected = false;
        this.ws = null;
        const reason = evt.reason || 'Connection closed';
        for (let i = 0; i < this.disconnectHandlers.length; i++) {
          this.disconnectHandlers[i](reason);
        }
      };
      ws.onerror = () => {
        if (!this.connected) {
          reject(new Error('WebSocket connection failed'));
        }
      };
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }

  send(data: string): void {
    if (this.ws && this.connected) {
      this.ws.send(data);
    }
  }

  onMessage(handler: (data: string) => void): () => void {
    this.messageHandlers.push(handler);
    return () => {
      const idx = this.messageHandlers.indexOf(handler);
      if (idx >= 0) this.messageHandlers.splice(idx, 1);
    };
  }

  onConnect(handler: () => void): () => void {
    this.connectHandlers.push(handler);
    return () => {
      const idx = this.connectHandlers.indexOf(handler);
      if (idx >= 0) this.connectHandlers.splice(idx, 1);
    };
  }

  onDisconnect(handler: (reason: string) => void): () => void {
    this.disconnectHandlers.push(handler);
    return () => {
      const idx = this.disconnectHandlers.indexOf(handler);
      if (idx >= 0) this.disconnectHandlers.splice(idx, 1);
    };
  }

  isConnected(): boolean {
    return this.connected;
  }
}
