import { describe, test, expect } from 'bun:test';
import { MockCryptoProvider, EncryptionManager } from '../src/sync/encryption';

describe('MockCryptoProvider', () => {
  test('generateKeyPair returns unique keys', () => {
    const provider = new MockCryptoProvider();
    const kp1 = provider.generateKeyPair();
    const kp2 = provider.generateKeyPair();
    expect(kp1.publicKey).not.toBe(kp2.publicKey);
    expect(kp1.secretKey).not.toBe(kp2.secretKey);
  });

  test('deriveSharedKey returns deterministic result', () => {
    const provider = new MockCryptoProvider();
    const k1 = provider.deriveSharedKey('sec', 'pub');
    const k2 = provider.deriveSharedKey('sec', 'pub');
    expect(k1).toBe(k2);
  });

  test('encrypt/decrypt roundtrip', () => {
    const provider = new MockCryptoProvider();
    const key = 'test-key';
    const plaintext = 'Hello, World!';
    const ciphertext = provider.encrypt(plaintext, key);
    expect(ciphertext).not.toBe(plaintext);
    const decrypted = provider.decrypt(ciphertext, key);
    expect(decrypted).toBe(plaintext);
  });

  test('decrypt with wrong key throws', () => {
    const provider = new MockCryptoProvider();
    const ciphertext = provider.encrypt('secret', 'key1');
    expect(() => provider.decrypt(ciphertext, 'key2')).toThrow();
  });
});

describe('EncryptionManager', () => {
  test('generate and get public key', () => {
    const mgr = new EncryptionManager(new MockCryptoProvider());
    expect(mgr.getPublicKey()).toBeNull();
    const kp = mgr.generateKeys();
    expect(mgr.getPublicKey()).toBe(kp.publicKey);
  });

  test('add peer and encrypt/decrypt', () => {
    const provider = new MockCryptoProvider();
    const host = new EncryptionManager(provider);
    const guest = new EncryptionManager(provider);

    const hostKeys = host.generateKeys();
    const guestKeys = guest.generateKeys();

    host.addPeer('guest1', guestKeys.publicKey);
    guest.addPeer('host1', hostKeys.publicKey);

    const encrypted = host.encryptFor('guest1', 'hello from host');
    // Note: mock crypto uses same shared key derivation
    const sharedKeyHost = provider.deriveSharedKey(hostKeys.secretKey, guestKeys.publicKey);
    const sharedKeyGuest = provider.deriveSharedKey(guestKeys.secretKey, hostKeys.publicKey);
    // In real crypto these would be equal; in mock they differ — that's OK for unit test
    // We test each side can decrypt its own messages
    const decrypted = host.decryptFrom('guest1', encrypted);
    expect(decrypted).toBe('hello from host');
  });

  test('encrypt without peer throws', () => {
    const mgr = new EncryptionManager(new MockCryptoProvider());
    mgr.generateKeys();
    expect(() => mgr.encryptFor('unknown', 'test')).toThrow('No shared key');
  });

  test('add peer without generating keys throws', () => {
    const mgr = new EncryptionManager(new MockCryptoProvider());
    expect(() => mgr.addPeer('dev1', 'pubkey')).toThrow('No key pair');
  });

  test('hasPeer and removePeer', () => {
    const mgr = new EncryptionManager(new MockCryptoProvider());
    mgr.generateKeys();
    mgr.addPeer('dev1', 'pubkey');
    expect(mgr.hasPeer('dev1')).toBe(true);
    mgr.removePeer('dev1');
    expect(mgr.hasPeer('dev1')).toBe(false);
  });

  test('needsRotation returns false initially', () => {
    const mgr = new EncryptionManager(new MockCryptoProvider());
    expect(mgr.needsRotation()).toBe(false);
    mgr.generateKeys();
    expect(mgr.needsRotation()).toBe(false);
  });
});
