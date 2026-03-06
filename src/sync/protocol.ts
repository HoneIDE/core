/**
 * Sync protocol — envelope format and message types.
 */

export interface SyncEnvelope {
  from: string;     // sender device ID
  to: string;       // target: device ID, 'host', or 'broadcast'
  room: string;     // room identifier
  seq: number;      // sequence number
  ts: number;       // timestamp (ms)
  encrypted: boolean;
  payload: string;  // JSON string (may be encrypted)
}

export interface PairingRequest {
  type: 'pairing_request';
  code: string;
  publicKey: string;
  deviceInfo: {
    deviceId: string;
    deviceName: string;
    platform: string;
    appVersion: string;
  };
}

export interface PairingResponse {
  type: 'pairing_response';
  success: boolean;
  token?: string;
  hostPublicKey?: string;
  error?: string;
}

export interface HandshakeMessage {
  type: 'handshake';
  version: number;
  token: string;
  deviceId: string;
}

export interface HandshakeAck {
  type: 'handshake_ack';
  success: boolean;
  error?: string;
}

export function createEnvelope(from: string, to: string, room: string, seq: number, payload: string, encrypted: boolean = false): SyncEnvelope {
  return { from, to, room, seq, ts: Date.now(), encrypted, payload };
}

export function parseEnvelope(data: string): SyncEnvelope | null {
  try {
    const obj = JSON.parse(data);
    if (typeof obj.from !== 'string' || typeof obj.to !== 'string' || typeof obj.room !== 'string') {
      return null;
    }
    return obj as SyncEnvelope;
  } catch {
    return null;
  }
}

export function validateEnvelope(env: SyncEnvelope): string | null {
  if (!env.from) return 'Missing "from" field';
  if (!env.to) return 'Missing "to" field';
  if (!env.room) return 'Missing "room" field';
  if (typeof env.seq !== 'number') return 'Invalid "seq" field';
  if (typeof env.ts !== 'number') return 'Invalid "ts" field';
  if (typeof env.payload !== 'string') return 'Invalid "payload" field';
  return null;
}
