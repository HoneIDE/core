/**
 * Relay transport — WebSocket connection via relay server.
 * Adds room identification and reconnection logic.
 */

import type { ITransport } from './transport';

export class RelayTransport implements ITransport {
  private ws: WebSocket | null = null;
  private messageHandlers: Array<(data: string) => void> = [];
  private connectHandlers: Array<() => void> = [];
  private disconnectHandlers: Array<(reason: string) => void> = [];
  private connected: boolean = false;
  private roomId: string;
  private deviceId: string;

  constructor(roomId: string, deviceId: string) {
    this.roomId = roomId;
    this.deviceId = deviceId;
  }

  async connect(url: string): Promise<void> {
    // Append room and device info to URL
    const separator = url.includes('?') ? '&' : '?';
    const fullUrl = `${url}${separator}room=${encodeURIComponent(this.roomId)}&device=${encodeURIComponent(this.deviceId)}`;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(fullUrl);
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
          reject(new Error('Relay WebSocket connection failed'));
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

  getRoomId(): string {
    return this.roomId;
  }

  getDeviceId(): string {
    return this.deviceId;
  }
}
