import { describe, test, expect } from 'bun:test';
import { createEnvelope, parseEnvelope, validateEnvelope } from '../src/sync/protocol';
import {
  generatePairingCode, validatePairingCode, normalizePairingCode,
  generateRoomId, buildPairingUrl, parsePairingUrl, getDefaultRelayUrl,
} from '../src/sync/pairing';
import { createDeviceToken, parseDeviceToken } from '../src/sync/device-token';
import {
  serializeConnection, parseConnection,
  serializeConnections, parseConnections,
  type StoredConnection,
} from '../src/sync/connection-store';

// --- Envelope ---

describe('SyncEnvelope', () => {
  test('createEnvelope creates valid envelope', () => {
    const env = createEnvelope('dev1', 'host', 'room1', 1, '{"hello":"world"}');
    expect(env.from).toBe('dev1');
    expect(env.to).toBe('host');
    expect(env.room).toBe('room1');
    expect(env.seq).toBe(1);
    expect(env.encrypted).toBe(false);
    expect(env.payload).toBe('{"hello":"world"}');
    expect(env.ts).toBeGreaterThan(0);
  });

  test('createEnvelope with encrypted flag', () => {
    const env = createEnvelope('dev1', 'host', 'room1', 1, 'ciphertext', true);
    expect(env.encrypted).toBe(true);
  });

  test('parseEnvelope parses valid JSON', () => {
    const env = createEnvelope('dev1', 'host', 'room1', 1, 'test');
    const parsed = parseEnvelope(JSON.stringify(env));
    expect(parsed).not.toBeNull();
    expect(parsed!.from).toBe('dev1');
    expect(parsed!.to).toBe('host');
  });

  test('parseEnvelope returns null for invalid JSON', () => {
    expect(parseEnvelope('not json')).toBeNull();
  });

  test('parseEnvelope returns null for missing fields', () => {
    expect(parseEnvelope('{"from":"a"}')).toBeNull();
  });

  test('validateEnvelope returns null for valid envelope', () => {
    const env = createEnvelope('dev1', 'host', 'room1', 1, 'test');
    expect(validateEnvelope(env)).toBeNull();
  });

  test('validateEnvelope returns error for missing from', () => {
    const env = createEnvelope('', 'host', 'room1', 1, 'test');
    expect(validateEnvelope(env)).toContain('from');
  });

  test('validateEnvelope returns error for missing to', () => {
    const env = createEnvelope('dev1', '', 'room1', 1, 'test');
    expect(validateEnvelope(env)).toContain('to');
  });

  test('validateEnvelope returns error for missing room', () => {
    const env = createEnvelope('dev1', 'host', '', 1, 'test');
    expect(validateEnvelope(env)).toContain('room');
  });
});

// --- Pairing ---

describe('PairingCode', () => {
  test('generates 6-char code', () => {
    const pc = generatePairingCode();
    expect(pc.code.length).toBe(6);
  });

  test('code uses valid characters', () => {
    const pc = generatePairingCode();
    expect(/^[0-9A-Z]+$/.test(pc.code)).toBe(true);
  });

  test('code does not contain I or O', () => {
    // Generate many codes to increase confidence
    for (let i = 0; i < 50; i++) {
      const pc = generatePairingCode();
      expect(pc.code).not.toContain('I');
      expect(pc.code).not.toContain('O');
    }
  });

  test('has expiration', () => {
    const pc = generatePairingCode();
    expect(pc.expiresAt).toBeGreaterThan(pc.createdAt);
    expect(pc.expiresAt - pc.createdAt).toBe(5 * 60 * 1000);
  });

  test('custom TTL', () => {
    const pc = generatePairingCode(1000);
    expect(pc.expiresAt - pc.createdAt).toBe(1000);
  });

  test('validate valid code', () => {
    const pc = generatePairingCode();
    const result = validatePairingCode(pc, pc.code);
    expect(result.valid).toBe(true);
  });

  test('validate case-insensitive', () => {
    const pc = generatePairingCode();
    const result = validatePairingCode(pc, pc.code.toLowerCase());
    expect(result.valid).toBe(true);
  });

  test('reject wrong code', () => {
    const pc = generatePairingCode();
    const result = validatePairingCode(pc, 'WRONG1');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid');
  });

  test('reject used code', () => {
    const pc = generatePairingCode();
    pc.used = true;
    const result = validatePairingCode(pc, pc.code);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('used');
  });

  test('reject expired code', () => {
    const pc = generatePairingCode();
    pc.expiresAt = Date.now() - 1000;
    const result = validatePairingCode(pc, pc.code);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('expired');
  });

  test('reject null stored code', () => {
    const result = validatePairingCode(null, 'ABC123');
    expect(result.valid).toBe(false);
  });

  test('normalizePairingCode uppercases and strips special chars', () => {
    expect(normalizePairingCode('abc-123')).toBe('ABC123');
    expect(normalizePairingCode('x y z')).toBe('XYZ');
  });
});

// --- Device Token ---

describe('DeviceToken', () => {
  const secret = 'test-secret-key';

  test('create and parse roundtrip', () => {
    const token = createDeviceToken('dev1', 'My Device', ['files.*', 'projects.list'], secret);
    const payload = parseDeviceToken(token, secret);
    expect(payload).not.toBeNull();
    expect(payload!.deviceId).toBe('dev1');
    expect(payload!.deviceName).toBe('My Device');
    expect(payload!.scopes).toEqual(['files.*', 'projects.list']);
  });

  test('reject wrong secret', () => {
    const token = createDeviceToken('dev1', 'Device', ['files.*'], secret);
    const payload = parseDeviceToken(token, 'wrong-secret');
    expect(payload).toBeNull();
  });

  test('reject expired token', () => {
    const token = createDeviceToken('dev1', 'Device', ['files.*'], secret, 1); // 1ms TTL
    // Wait a tiny bit
    const start = Date.now();
    while (Date.now() - start < 5) {} // busy wait 5ms
    const payload = parseDeviceToken(token, secret);
    expect(payload).toBeNull();
  });

  test('token without TTL does not expire', () => {
    const token = createDeviceToken('dev1', 'Device', ['files.*'], secret);
    const payload = parseDeviceToken(token, secret);
    expect(payload).not.toBeNull();
    expect(payload!.expiresAt).toBeUndefined();
  });

  test('reject malformed token (no dot)', () => {
    expect(parseDeviceToken('nodot', secret)).toBeNull();
  });

  test('reject tampered payload', () => {
    const token = createDeviceToken('dev1', 'Device', ['files.*'], secret);
    // Tamper: change first char of payload
    const tampered = 'X' + token.slice(1);
    expect(parseDeviceToken(tampered, secret)).toBeNull();
  });
});

// --- Room ID ---

describe('generateRoomId', () => {
  test('generates UUID-like format', () => {
    const id = generateRoomId();
    expect(id.length).toBe(36); // 8-4-4-4-12
    expect(id[8]).toBe('-');
    expect(id[13]).toBe('-');
    expect(id[18]).toBe('-');
    expect(id[23]).toBe('-');
  });

  test('uses hex characters only', () => {
    const id = generateRoomId();
    const stripped = id.replace(/-/g, '');
    expect(/^[0-9a-f]+$/.test(stripped)).toBe(true);
  });

  test('generates unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      ids.add(generateRoomId());
    }
    expect(ids.size).toBe(50);
  });
});

// --- Pairing URL ---

describe('PairingUrl', () => {
  test('buildPairingUrl creates valid URL', () => {
    const url = buildPairingUrl('wss://sync.hone.codes/ws', 'room-123', 'ABC123');
    expect(url).toContain('hone://pair?');
    expect(url).toContain('relay=');
    expect(url).toContain('room=');
    expect(url).toContain('code=ABC123');
  });

  test('buildPairingUrl with public key', () => {
    const url = buildPairingUrl('wss://relay.example.com', 'room-1', 'XYZ789', 'deadbeef');
    expect(url).toContain('pk=deadbeef');
  });

  test('buildPairingUrl without public key', () => {
    const url = buildPairingUrl('wss://relay.example.com', 'room-1', 'XYZ789');
    expect(url).not.toContain('pk=');
  });

  test('parsePairingUrl roundtrip', () => {
    const url = buildPairingUrl('wss://sync.hone.codes/ws', 'room-abc', 'CODE42', 'pk123');
    const parsed = parsePairingUrl(url);
    expect(parsed).not.toBeNull();
    expect(parsed!.relay).toBe('wss://sync.hone.codes/ws');
    expect(parsed!.room).toBe('room-abc');
    expect(parsed!.code).toBe('CODE42');
    expect(parsed!.pk).toBe('pk123');
  });

  test('parsePairingUrl without pk', () => {
    const url = buildPairingUrl('wss://relay.test', 'room-1', 'ABCDEF');
    const parsed = parsePairingUrl(url);
    expect(parsed).not.toBeNull();
    expect(parsed!.pk).toBe('');
  });

  test('parsePairingUrl rejects invalid prefix', () => {
    expect(parsePairingUrl('https://example.com')).toBeNull();
    expect(parsePairingUrl('')).toBeNull();
  });

  test('parsePairingUrl rejects missing required fields', () => {
    expect(parsePairingUrl('hone://pair?relay=x')).toBeNull();
    expect(parsePairingUrl('hone://pair?relay=x&room=y')).toBeNull();
  });

  test('handles URL-encoded relay', () => {
    const url = buildPairingUrl('wss://sync.hone.codes/ws', 'room-1', 'ABC123');
    const parsed = parsePairingUrl(url);
    expect(parsed!.relay).toBe('wss://sync.hone.codes/ws');
  });

  test('getDefaultRelayUrl returns expected value', () => {
    expect(getDefaultRelayUrl()).toBe('wss://sync.hone.codes/ws');
  });
});

// --- Connection Store ---

describe('ConnectionStore', () => {
  const conn: StoredConnection = {
    relayUrl: 'wss://sync.hone.codes/ws',
    roomId: 'room-abc-123',
    deviceToken: 'eyJkZXZpY2VJZCI6ImRldjEifQ.abc123',
    hostDeviceId: 'host-1',
    hostName: 'My Mac',
    deviceId: 'guest-1',
    deviceName: 'My iPhone',
    pairedAt: 1700000000000,
  };

  test('serializeConnection produces key=value format', () => {
    const text = serializeConnection(conn);
    expect(text).toContain('relayUrl=wss://sync.hone.codes/ws\n');
    expect(text).toContain('roomId=room-abc-123\n');
    expect(text).toContain('deviceToken=eyJkZXZpY2VJZCI6ImRldjEifQ.abc123\n');
    expect(text).toContain('hostName=My Mac\n');
    expect(text).toContain('pairedAt=1700000000000\n');
  });

  test('parseConnection roundtrip', () => {
    const text = serializeConnection(conn);
    const parsed = parseConnection(text);
    expect(parsed).not.toBeNull();
    expect(parsed!.relayUrl).toBe(conn.relayUrl);
    expect(parsed!.roomId).toBe(conn.roomId);
    expect(parsed!.deviceToken).toBe(conn.deviceToken);
    expect(parsed!.hostDeviceId).toBe(conn.hostDeviceId);
    expect(parsed!.hostName).toBe(conn.hostName);
    expect(parsed!.deviceId).toBe(conn.deviceId);
    expect(parsed!.deviceName).toBe(conn.deviceName);
    expect(parsed!.pairedAt).toBe(conn.pairedAt);
  });

  test('parseConnection returns null for empty text', () => {
    expect(parseConnection('')).toBeNull();
  });

  test('parseConnection returns null for missing required fields', () => {
    expect(parseConnection('relayUrl=x\n')).toBeNull();
    expect(parseConnection('relayUrl=x\nroomId=y\n')).toBeNull();
  });

  test('serializeConnections multiple', () => {
    const conn2: StoredConnection = { ...conn, roomId: 'room-2', hostName: 'Other Mac' };
    const text = serializeConnections([conn, conn2]);
    expect(text).toContain('[connection]');
    expect(text).toContain('room-abc-123');
    expect(text).toContain('room-2');
  });

  test('parseConnections roundtrip', () => {
    const conn2: StoredConnection = { ...conn, roomId: 'room-2', deviceName: 'iPad' };
    const text = serializeConnections([conn, conn2]);
    const parsed = parseConnections(text);
    expect(parsed.length).toBe(2);
    expect(parsed[0].roomId).toBe('room-abc-123');
    expect(parsed[1].roomId).toBe('room-2');
    expect(parsed[1].deviceName).toBe('iPad');
  });

  test('parseConnections handles empty text', () => {
    expect(parseConnections('').length).toBe(0);
  });
});
