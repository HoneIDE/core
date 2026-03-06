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
