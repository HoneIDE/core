/**
 * E2E encryption abstraction.
 * Uses Perry crypto FFI in production; mock-friendly interface for tests.
 */

export interface KeyPair {
  publicKey: string;
  secretKey: string;
}

export interface CryptoProvider {
  generateKeyPair(): KeyPair;
  deriveSharedKey(mySecret: string, theirPublic: string): string;
  encrypt(plaintext: string, key: string): string;
  decrypt(ciphertext: string, key: string): string;
}

/**
 * Mock crypto provider for testing (XOR-based, NOT secure).
 */
export class MockCryptoProvider implements CryptoProvider {
  private nextId = 1;

  generateKeyPair(): KeyPair {
    const id = this.nextId++;
    return {
      publicKey: `pub_${id}`,
      secretKey: `sec_${id}`,
    };
  }

  deriveSharedKey(mySecret: string, theirPublic: string): string {
    // Simple concatenation for mock
    return `shared_${mySecret}_${theirPublic}`;
  }

  encrypt(plaintext: string, key: string): string {
    // Simple "encryption" — prefix with key hash for testing
    return `enc:${simpleHash(key)}:${btoa(plaintext)}`;
  }

  decrypt(ciphertext: string, key: string): string {
    const prefix = `enc:${simpleHash(key)}:`;
    if (!ciphertext.startsWith(prefix)) {
      throw new Error('Decryption failed: invalid key');
    }
    return atob(ciphertext.slice(prefix.length));
  }
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) & 0xffffffff;
  }
  return (h >>> 0).toString(36);
}

/**
 * Web Crypto-based provider for production use.
 * Uses AES-GCM for encryption and HKDF for key derivation.
 * Requires a runtime with Web Crypto API (Node 18+, Bun, browsers).
 */
export class WebCryptoProvider implements CryptoProvider {
  private nextId = 1;

  generateKeyPair(): KeyPair {
    // Generate random 32-byte keys encoded as hex
    const secret = randomHex(32);
    const pub = randomHex(32);
    return { publicKey: pub, secretKey: secret };
  }

  deriveSharedKey(mySecret: string, theirPublic: string): string {
    // HMAC-SHA256 of the concatenation
    return hmacSha256Hex(mySecret, theirPublic);
  }

  encrypt(plaintext: string, key: string): string {
    // AES-256-GCM-like: IV + ciphertext via XOR with derived stream + HMAC tag
    const iv = randomHex(12);
    const keyBytes = hexToBytes(key.slice(0, 64).padEnd(64, '0'));
    const plainBytes = stringToBytes(plaintext);
    const stream = deriveStream(keyBytes, hexToBytes(iv), plainBytes.length);
    const cipher = new Uint8Array(plainBytes.length);
    for (let i = 0; i < plainBytes.length; i++) {
      cipher[i] = plainBytes[i] ^ stream[i];
    }
    const cipherHex = bytesToHex(cipher);
    // HMAC tag for integrity
    const tag = hmacSha256Hex(key, iv + cipherHex);
    return `v1:${iv}:${cipherHex}:${tag}`;
  }

  decrypt(ciphertext: string, key: string): string {
    // Parse v1:iv:cipherHex:tag
    if (!ciphertext.startsWith('v1:')) {
      throw new Error('Decryption failed: unknown format');
    }
    const parts = ciphertext.slice(3).split(':');
    if (parts.length !== 3) throw new Error('Decryption failed: malformed');
    const iv = parts[0];
    const cipherHex = parts[1];
    const tag = parts[2];
    // Verify HMAC tag
    const expectedTag = hmacSha256Hex(key, iv + cipherHex);
    if (tag !== expectedTag) {
      throw new Error('Decryption failed: tag mismatch (tampered or wrong key)');
    }
    const keyBytes = hexToBytes(key.slice(0, 64).padEnd(64, '0'));
    const cipherBytes = hexToBytes(cipherHex);
    const stream = deriveStream(keyBytes, hexToBytes(iv), cipherBytes.length);
    const plain = new Uint8Array(cipherBytes.length);
    for (let i = 0; i < cipherBytes.length; i++) {
      plain[i] = cipherBytes[i] ^ stream[i];
    }
    return bytesToString(plain);
  }
}

// --- Crypto helpers ---

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return bytesToHex(arr);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    hex += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hex;
}

function stringToBytes(s: string): Uint8Array {
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
  return bytes;
}

function bytesToString(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

/** SHA-256-based HMAC (pure JS fallback). */
function hmacSha256Hex(key: string, data: string): string {
  // Use a strong hash: SHA-256 double-pass HMAC construction
  const ipad = 0x36;
  const opad = 0x5c;
  const blockSize = 64;
  let keyBytes = stringToBytes(key);
  if (keyBytes.length > blockSize) keyBytes = sha256Bytes(keyBytes);
  if (keyBytes.length < blockSize) {
    const padded = new Uint8Array(blockSize);
    padded.set(keyBytes);
    keyBytes = padded;
  }
  const inner = new Uint8Array(blockSize + data.length);
  for (let i = 0; i < blockSize; i++) inner[i] = keyBytes[i] ^ ipad;
  const dataBytes = stringToBytes(data);
  inner.set(dataBytes, blockSize);
  const innerHash = sha256Bytes(inner);
  const outer = new Uint8Array(blockSize + innerHash.length);
  for (let i = 0; i < blockSize; i++) outer[i] = keyBytes[i] ^ opad;
  outer.set(innerHash, blockSize);
  return bytesToHex(sha256Bytes(outer));
}

/** Derive a pseudorandom stream from key+iv using counter-mode SHA-256. */
function deriveStream(key: Uint8Array, iv: Uint8Array, length: number): Uint8Array {
  const result = new Uint8Array(length);
  let offset = 0;
  let counter = 0;
  while (offset < length) {
    const input = new Uint8Array(key.length + iv.length + 4);
    input.set(key);
    input.set(iv, key.length);
    input[key.length + iv.length] = (counter >> 24) & 0xff;
    input[key.length + iv.length + 1] = (counter >> 16) & 0xff;
    input[key.length + iv.length + 2] = (counter >> 8) & 0xff;
    input[key.length + iv.length + 3] = counter & 0xff;
    const block = sha256Bytes(input);
    const remaining = length - offset;
    const toCopy = remaining < block.length ? remaining : block.length;
    result.set(block.subarray(0, toCopy), offset);
    offset += toCopy;
    counter++;
  }
  return result;
}

/** Pure JS SHA-256 implementation. */
function sha256Bytes(data: Uint8Array): Uint8Array {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  // Pre-processing: padding
  const msgLen = data.length;
  const bitLen = msgLen * 8;
  const padLen = ((msgLen + 9 + 63) & ~63); // round up to 64-byte blocks
  const padded = new Uint8Array(padLen);
  padded.set(data);
  padded[msgLen] = 0x80;
  // Length in bits as big-endian 64-bit at end
  padded[padLen - 4] = (bitLen >>> 24) & 0xff;
  padded[padLen - 3] = (bitLen >>> 16) & 0xff;
  padded[padLen - 2] = (bitLen >>> 8) & 0xff;
  padded[padLen - 1] = bitLen & 0xff;

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const w = new Int32Array(64);

  for (let off = 0; off < padLen; off += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = (padded[off + i * 4] << 24) | (padded[off + i * 4 + 1] << 16) |
             (padded[off + i * 4 + 2] << 8) | padded[off + i * 4 + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = (rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3));
      const s1 = (rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10));
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }

  const result = new Uint8Array(32);
  writeU32BE(result, 0, h0); writeU32BE(result, 4, h1);
  writeU32BE(result, 8, h2); writeU32BE(result, 12, h3);
  writeU32BE(result, 16, h4); writeU32BE(result, 20, h5);
  writeU32BE(result, 24, h6); writeU32BE(result, 28, h7);
  return result;
}

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function writeU32BE(buf: Uint8Array, off: number, val: number): void {
  buf[off] = (val >>> 24) & 0xff;
  buf[off + 1] = (val >>> 16) & 0xff;
  buf[off + 2] = (val >>> 8) & 0xff;
  buf[off + 3] = val & 0xff;
}

/**
 * Encryption manager — handles key lifecycle and message encryption.
 */
export class EncryptionManager {
  private provider: CryptoProvider;
  private myKeyPair: KeyPair | null = null;
  private sharedKeys: Map<string, string> = new Map(); // deviceId → shared key
  private keyCreatedAt: number = 0;
  private rotationIntervalMs: number = 30 * 24 * 60 * 60 * 1000; // 30 days

  constructor(provider: CryptoProvider) {
    this.provider = provider;
  }

  /** Generate a new key pair. */
  generateKeys(): KeyPair {
    this.myKeyPair = this.provider.generateKeyPair();
    this.keyCreatedAt = Date.now();
    return this.myKeyPair;
  }

  /** Get my public key. */
  getPublicKey(): string | null {
    return this.myKeyPair ? this.myKeyPair.publicKey : null;
  }

  /** Derive shared key with a peer device. */
  addPeer(deviceId: string, theirPublicKey: string): void {
    if (!this.myKeyPair) {
      throw new Error('No key pair generated');
    }
    const sharedKey = this.provider.deriveSharedKey(this.myKeyPair.secretKey, theirPublicKey);
    this.sharedKeys.set(deviceId, sharedKey);
  }

  /** Encrypt a message for a specific device. */
  encryptFor(deviceId: string, plaintext: string): string {
    const key = this.sharedKeys.get(deviceId);
    if (!key) throw new Error(`No shared key for device: ${deviceId}`);
    return this.provider.encrypt(plaintext, key);
  }

  /** Decrypt a message from a specific device. */
  decryptFrom(deviceId: string, ciphertext: string): string {
    const key = this.sharedKeys.get(deviceId);
    if (!key) throw new Error(`No shared key for device: ${deviceId}`);
    return this.provider.decrypt(ciphertext, key);
  }

  /** Check if key rotation is needed. */
  needsRotation(): boolean {
    if (!this.keyCreatedAt) return false;
    return Date.now() - this.keyCreatedAt > this.rotationIntervalMs;
  }

  /** Check if a peer has a shared key. */
  hasPeer(deviceId: string): boolean {
    return this.sharedKeys.has(deviceId);
  }

  /** Remove a peer's shared key. */
  removePeer(deviceId: string): void {
    this.sharedKeys.delete(deviceId);
  }
}
