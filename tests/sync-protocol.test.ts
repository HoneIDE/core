import { describe, test, expect } from 'bun:test';
import { createEnvelope, parseEnvelope, validateEnvelope } from '../src/sync/protocol';
import { generatePairingCode, validatePairingCode, normalizePairingCode } from '../src/sync/pairing';
import { createDeviceToken, parseDeviceToken } from '../src/sync/device-token';

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
