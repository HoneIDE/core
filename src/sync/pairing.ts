/**
 * Pairing code generation and validation.
 * 6-character alphanumeric codes with 5-minute TTL.
 * Also: room ID generation, pairing URL build/parse.
 */

const CODE_CHARS = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // No I, O (avoid confusion)
const CODE_LENGTH = 6;
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const HEX_CHARS = '0123456789abcdef';
const DEFAULT_RELAY_URL = 'wss://sync.hone.codes/ws';

export interface PairingCode {
  code: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
}

export interface PairingUrl {
  relay: string;
  room: string;
  code: string;
  pk: string;
}

export function generatePairingCode(ttlMs: number = DEFAULT_TTL_MS): PairingCode {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    const idx = Math.floor(Math.random() * CODE_CHARS.length);
    code += CODE_CHARS[idx];
  }
  const now = Date.now();
  return {
    code,
    createdAt: now,
    expiresAt: now + ttlMs,
    used: false,
  };
}

export function validatePairingCode(stored: PairingCode | null, inputCode: string): { valid: boolean; error?: string } {
  if (!stored) {
    return { valid: false, error: 'No pairing code active' };
  }
  if (stored.used) {
    return { valid: false, error: 'Pairing code already used' };
  }
  if (Date.now() > stored.expiresAt) {
    return { valid: false, error: 'Pairing code expired' };
  }
  if (stored.code !== inputCode.toUpperCase()) {
    return { valid: false, error: 'Invalid pairing code' };
  }
  return { valid: true };
}

export function normalizePairingCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** Generate a random room ID (opaque, not derived from device identity). */
export function generateRoomId(): string {
  let id = '';
  for (let i = 0; i < 32; i++) {
    const idx = Math.floor(Math.random() * HEX_CHARS.length);
    id += HEX_CHARS[idx];
  }
  // Format as UUID-like: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  let out = '';
  out += id.slice(0, 8);
  out += '-';
  out += id.slice(8, 12);
  out += '-';
  out += id.slice(12, 16);
  out += '-';
  out += id.slice(16, 20);
  out += '-';
  out += id.slice(20, 32);
  return out;
}

/** Build a pairing URL that encodes all info needed to connect. */
export function buildPairingUrl(relay: string, room: string, code: string, pk: string = ''): string {
  let url = 'hone://pair?relay=';
  url += encodeURIComponent(relay);
  url += '&room=';
  url += encodeURIComponent(room);
  url += '&code=';
  url += code;
  if (pk.length > 0) {
    url += '&pk=';
    url += pk;
  }
  return url;
}

/** Parse a pairing URL back into its components. Returns null if invalid. */
export function parsePairingUrl(url: string): PairingUrl | null {
  // Expected: hone://pair?relay=...&room=...&code=...&pk=...
  const prefix = 'hone://pair?';
  if (url.length < prefix.length) return null;
  if (url.slice(0, prefix.length) !== prefix) return null;

  const queryStr = url.slice(prefix.length);
  const params = queryStr.split('&');

  let relay = '';
  let room = '';
  let code = '';
  let pk = '';

  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    let eqIdx = -1;
    for (let j = 0; j < param.length; j++) {
      if (param.charCodeAt(j) === 61) { eqIdx = j; break; }
    }
    if (eqIdx < 1) continue;
    const key = param.slice(0, eqIdx);
    const val = param.slice(eqIdx + 1);
    if (key === 'relay') relay = decodeURIComponent(val);
    if (key === 'room') room = decodeURIComponent(val);
    if (key === 'code') code = val;
    if (key === 'pk') pk = val;
  }

  if (relay.length === 0 || room.length === 0 || code.length === 0) {
    return null;
  }

  return { relay, room, code, pk };
}

/** Get the default relay URL. */
export function getDefaultRelayUrl(): string {
  return DEFAULT_RELAY_URL;
}
