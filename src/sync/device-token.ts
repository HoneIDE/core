/**
 * Device token creation and validation.
 * Simple JWT-like token (base64-encoded JSON + HMAC signature).
 */

export interface DeviceTokenPayload {
  deviceId: string;
  deviceName: string;
  scopes: string[];
  issuedAt: number;
  expiresAt?: number;
}

export interface DeviceToken {
  payload: DeviceTokenPayload;
  signature: string;
}

/**
 * Create a device token.
 * Uses simple base64 encoding + signature placeholder.
 * In production, signature is computed via Perry crypto FFI (HMAC-SHA256).
 */
export function createDeviceToken(
  deviceId: string,
  deviceName: string,
  scopes: string[],
  secret: string,
  ttlMs?: number,
): string {
  const payload: DeviceTokenPayload = {
    deviceId,
    deviceName,
    scopes,
    issuedAt: Date.now(),
  };
  if (ttlMs) {
    payload.expiresAt = payload.issuedAt + ttlMs;
  }

  const payloadB64 = btoa(JSON.stringify(payload));
  const sig = simpleSign(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

/**
 * Parse and validate a device token.
 */
export function parseDeviceToken(token: string, secret: string): DeviceTokenPayload | null {
  const dotIdx = token.indexOf('.');
  if (dotIdx < 0) return null;

  const payloadB64 = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);

  // Verify signature
  const expectedSig = simpleSign(payloadB64, secret);
  if (sig !== expectedSig) return null;

  try {
    const payload = JSON.parse(atob(payloadB64)) as DeviceTokenPayload;

    // Check expiration
    if (payload.expiresAt && Date.now() > payload.expiresAt) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Simple signing function (djb2 hash of payload+secret).
 * In production this would be replaced by HMAC-SHA256 via Perry FFI.
 */
function simpleSign(data: string, secret: string): string {
  const input = data + '.' + secret;
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) & 0xffffffff;
  }
  return (hash >>> 0).toString(36);
}
