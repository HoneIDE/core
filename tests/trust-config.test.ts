import { describe, test, expect } from 'bun:test';
import { TrustConfig } from '../src/queue/trust-config';

describe('TrustConfig', () => {
  test('default trust level is review', () => {
    const tc = new TrustConfig();
    expect(tc.getTrust('unknown-device')).toBe('review');
  });

  test('set and get trust level', () => {
    const tc = new TrustConfig();
    tc.setTrust('dev1', 'auto-accept-clean');
    expect(tc.getTrust('dev1')).toBe('auto-accept-clean');
  });

  test('update existing trust level', () => {
    const tc = new TrustConfig();
    tc.setTrust('dev1', 'auto-accept-clean');
    tc.setTrust('dev1', 'block');
    expect(tc.getTrust('dev1')).toBe('block');
  });

  test('remove trust entry falls back to default', () => {
    const tc = new TrustConfig();
    tc.setTrust('dev1', 'block');
    const removed = tc.removeTrust('dev1');
    expect(removed).toBe(true);
    expect(tc.getTrust('dev1')).toBe('review');
  });

  test('remove non-existent entry returns false', () => {
    const tc = new TrustConfig();
    expect(tc.removeTrust('nonexistent')).toBe(false);
  });

  test('set default trust level', () => {
    const tc = new TrustConfig();
    tc.setDefaultLevel('auto-accept-clean');
    expect(tc.getDefaultLevel()).toBe('auto-accept-clean');
    expect(tc.getTrust('unknown')).toBe('auto-accept-clean');
  });

  test('shouldAutoAccept with auto-accept-all', () => {
    const tc = new TrustConfig();
    tc.setTrust('dev1', 'auto-accept-all');
    expect(tc.shouldAutoAccept('dev1', true)).toBe(true);
    expect(tc.shouldAutoAccept('dev1', false)).toBe(true);
  });

  test('shouldAutoAccept with auto-accept-clean', () => {
    const tc = new TrustConfig();
    tc.setTrust('dev1', 'auto-accept-clean');
    expect(tc.shouldAutoAccept('dev1', true)).toBe(true);
    expect(tc.shouldAutoAccept('dev1', false)).toBe(false);
  });

  test('shouldAutoAccept with review returns false', () => {
    const tc = new TrustConfig();
    expect(tc.shouldAutoAccept('unknown', true)).toBe(false);
  });

  test('isBlocked', () => {
    const tc = new TrustConfig();
    tc.setTrust('blocked-dev', 'block');
    expect(tc.isBlocked('blocked-dev')).toBe(true);
    expect(tc.isBlocked('other-dev')).toBe(false);
  });

  test('getAllEntries returns copies', () => {
    const tc = new TrustConfig();
    tc.setTrust('dev1', 'block');
    tc.setTrust('dev2', 'auto-accept-clean');
    const entries = tc.getAllEntries();
    expect(entries.length).toBe(2);
  });
});
