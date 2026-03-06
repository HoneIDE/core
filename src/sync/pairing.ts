/**
 * Pairing code generation and validation.
 * 6-character alphanumeric codes with 5-minute TTL.
 */

const CODE_CHARS = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // No I, O (avoid confusion)
const CODE_LENGTH = 6;
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface PairingCode {
  code: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
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
