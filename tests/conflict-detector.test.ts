import { describe, test, expect } from 'bun:test';
import { detectConflict } from '../src/queue/conflict-detector';
import { hashContent } from '../src/queue/diff-applier';

function makeDiff(oldLine: string, newLine: string): string {
  return [
    'diff --git a/file.ts b/file.ts',
    '--- a/file.ts',
    '+++ b/file.ts',
    '@@ -1,3 +1,3 @@',
    ' line1',
    `-${oldLine}`,
    `+${newLine}`,
    ' line3',
  ].join('\n');
}

describe('detectConflict', () => {
  test('no conflict when base hash matches current', () => {
    const content = 'line1\nold\nline3';
    const hash = hashContent(content);
    const result = detectConflict(content, hash, hash, makeDiff('old', 'new'));
    expect(result.state).toBe('none');
  });

  test('no conflict when no base hash provided', () => {
    const result = detectConflict('content', 'abc', undefined, 'some diff');
    expect(result.state).toBe('none');
  });

  test('no conflict when file does not exist (new file)', () => {
    const result = detectConflict(null, null, undefined, 'some diff');
    expect(result.state).toBe('none');
  });

  test('resolved conflict when hashes differ but patch applies cleanly', () => {
    const original = 'line1\nold\nline3';
    const baseHash = hashContent(original);

    // File was modified in a non-overlapping way (e.g., at end)
    const modified = 'line1\nold\nline3\nextra';
    const currentHash = hashContent(modified);

    const diff = makeDiff('old', 'new');
    const result = detectConflict(modified, currentHash, baseHash, diff);
    expect(result.state).toBe('resolved');
  });

  test('unresolved conflict when hashes differ and patch fails', () => {
    const original = 'line1\nold\nline3';
    const baseHash = hashContent(original);

    // File was modified in the same region
    const modified = 'line1\nchanged\nline3';
    const currentHash = hashContent(modified);

    const diff = makeDiff('old', 'new');
    const result = detectConflict(modified, currentHash, baseHash, diff);
    expect(result.state).toBe('unresolved');
    if (result.state === 'unresolved') {
      expect(result.reason).toContain('overlap');
    }
  });

  test('no conflict with empty diff', () => {
    const result = detectConflict('content', 'hash', 'other', '');
    expect(result.state).toBe('none');
  });

  test('no conflict with diff that has no hunks', () => {
    const diff = 'diff --git a/file.ts b/file.ts\nindex abc..def 100644';
    const result = detectConflict('content', 'hash1', 'hash2', diff);
    expect(result.state).toBe('none');
  });

  test('resolved when patch applies to modified content', () => {
    const base = 'aaa\nbbb\nccc\nddd\neee';
    const baseHash = hashContent(base);

    // Modified at end only
    const current = 'aaa\nbbb\nccc\nddd\nEEE';
    const currentHash = hashContent(current);

    // Patch modifies beginning only
    const diff = [
      'diff --git a/file.ts b/file.ts',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,2 +1,2 @@',
      '-aaa',
      '+AAA',
      ' bbb',
    ].join('\n');

    const result = detectConflict(current, currentHash, baseHash, diff);
    expect(result.state).toBe('resolved');
  });
});
