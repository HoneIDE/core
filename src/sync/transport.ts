/**
 * Transport abstraction for sync communication.
 */

export interface ITransport {
  connect(url: string): Promise<void>;
  disconnect(): void;
  send(data: string): void;
  onMessage(handler: (data: string) => void): () => void;
  onConnect(handler: () => void): () => void;
  onDisconnect(handler: (reason: string) => void): () => void;
  isConnected(): boolean;
}
