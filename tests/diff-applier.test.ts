import { describe, test, expect } from 'bun:test';
import { applyPatch, applyHunks, reverseDiff, hashContent } from '../src/queue/diff-applier';
import { parseUnifiedDiff } from '../src/git/diff';

describe('applyPatch', () => {
  test('apply single-line addition', () => {
    const content = 'line1\nline2\nline3';
    const diff = [
      'diff --git a/file.ts b/file.ts',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,3 +1,4 @@',
      ' line1',
      '+inserted',
      ' line2',
      ' line3',
    ].join('\n');

    const result = applyPatch(content, diff);
    expect(result.success).toBe(true);
    expect(result.newContent).toBe('line1\ninserted\nline2\nline3');
  });

  test('apply single-line deletion', () => {
    const content = 'line1\nline2\nline3';
    const diff = [
      'diff --git a/file.ts b/file.ts',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,3 +1,2 @@',
      ' line1',
      '-line2',
      ' line3',
    ].join('\n');

    const result = applyPatch(content, diff);
    expect(result.success).toBe(true);
    expect(result.newContent).toBe('line1\nline3');
  });

  test('apply line replacement', () => {
    const content = 'const x = 1;\nconst y = 2;\nconst z = 3;';
    const diff = [
      'diff --git a/file.ts b/file.ts',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,3 +1,3 @@',
      ' const x = 1;',
      '-const y = 2;',
      '+const y = 42;',
      ' const z = 3;',
    ].join('\n');

    const result = applyPatch(content, diff);
    expect(result.success).toBe(true);
    expect(result.newContent).toBe('const x = 1;\nconst y = 42;\nconst z = 3;');
  });

  test('apply multi-hunk diff', () => {
    const content = 'a\nb\nc\nd\ne\nf\ng\nh';
    const diff = [
      'diff --git a/file.ts b/file.ts',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,3 +1,3 @@',
      ' a',
      '-b',
      '+B',
      ' c',
      '@@ -6,3 +6,3 @@',
      ' f',
      '-g',
      '+G',
      ' h',
    ].join('\n');

    const result = applyPatch(content, diff);
    expect(result.success).toBe(true);
    expect(result.newContent).toBe('a\nB\nc\nd\ne\nf\nG\nh');
  });

  test('fail on context mismatch', () => {
    const content = 'line1\nline2\nline3';
    const diff = [
      'diff --git a/file.ts b/file.ts',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,3 +1,3 @@',
      ' line1',
      '-wrong_content',
      '+new_content',
      ' line3',
    ].join('\n');

    const result = applyPatch(content, diff);
    expect(result.success).toBe(false);
    expect(result.error).toContain('mismatch');
  });

  test('fail on file too short', () => {
    const content = 'line1';
    const diff = [
      'diff --git a/file.ts b/file.ts',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,3 +1,3 @@',
      ' line1',
      '-line2',
      '+new',
      ' line3',
    ].join('\n');

    const result = applyPatch(content, diff);
    expect(result.success).toBe(false);
    expect(result.error).toContain('too short');
  });

  test('fail on empty diff', () => {
    const result = applyPatch('content', '');
    expect(result.success).toBe(false);
    expect(result.error).toContain('No diff hunks');
  });

  test('apply to empty file (new lines)', () => {
    const content = '';
    const diff = [
      'diff --git a/file.ts b/file.ts',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,1 +1,3 @@',
      '-',
      '+hello',
      '+world',
      '+',
    ].join('\n');

    const result = applyPatch(content, diff);
    expect(result.success).toBe(true);
    expect(result.newContent).toBe('hello\nworld\n');
  });

  test('delete all lines', () => {
    const content = 'hello\nworld';
    const diff = [
      'diff --git a/file.ts b/file.ts',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,2 +1,0 @@',
      '-hello',
      '-world',
    ].join('\n');

    const result = applyPatch(content, diff);
    expect(result.success).toBe(true);
    expect(result.newContent).toBe('');
  });

  test('apply patch with multiple additions', () => {
    const content = 'a\nb';
    const diff = [
      'diff --git a/file.ts b/file.ts',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,2 +1,5 @@',
      ' a',
      '+x',
      '+y',
      '+z',
      ' b',
    ].join('\n');

    const result = applyPatch(content, diff);
    expect(result.success).toBe(true);
    expect(result.newContent).toBe('a\nx\ny\nz\nb');
  });
});

describe('applyHunks', () => {
  test('apply empty hunks returns same content', () => {
    const result = applyHunks('hello\nworld', []);
    expect(result.success).toBe(true);
    expect(result.newContent).toBe('hello\nworld');
  });
});

describe('reverseDiff', () => {
  test('swap add/delete lines', () => {
    const diff = [
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,3 +1,3 @@',
      ' context',
      '-deleted',
      '+added',
      ' context',
    ].join('\n');

    const reversed = reverseDiff(diff);
    const lines = reversed.split('\n');
    expect(lines[0]).toBe('+++ b/file.ts');
    expect(lines[1]).toBe('--- a/file.ts');
    expect(lines[3]).toBe(' context');
    expect(lines[4]).toBe('+deleted');
    expect(lines[5]).toBe('-added');
    expect(lines[6]).toBe(' context');
  });

  test('swap hunk header numbers', () => {
    const diff = '@@ -1,3 +1,4 @@ function foo';
    const reversed = reverseDiff(diff);
    expect(reversed).toBe('@@ -1,4 +1,3 @@ function foo');
  });

  test('roundtrip: apply then reverse cancels out', () => {
    const content = 'line1\nline2\nline3';
    const diff = [
      'diff --git a/file.ts b/file.ts',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,3 +1,3 @@',
      ' line1',
      '-line2',
      '+LINE2',
      ' line3',
    ].join('\n');

    const applied = applyPatch(content, diff);
    expect(applied.success).toBe(true);
    expect(applied.newContent).toBe('line1\nLINE2\nline3');

    // reverseDiff swaps --- and +++ headers, so we wrap with a fresh diff --git header
    const revBody = reverseDiff(diff);
    // The reversed output starts with +++ (was ---), then --- (was +++).
    // For parseUnifiedDiff we need diff --git a/... b/... then --- a/... then +++ b/...
    const revDiff = [
      'diff --git a/file.ts b/file.ts',
      '--- a/file.ts',
      '+++ b/file.ts',
      // Extract just the hunk lines from reversed diff
      ...revBody.split('\n').filter(l => l.startsWith('@@ ') || l.startsWith(' ') || l.startsWith('+') || l.startsWith('-')),
    ].join('\n');

    const reverted = applyPatch(applied.newContent, revDiff);
    expect(reverted.success).toBe(true);
    expect(reverted.newContent).toBe(content);
  });

  test('preserve context lines', () => {
    const diff = [
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,2 +1,2 @@',
      ' unchanged',
      '-old',
    ].join('\n');

    const reversed = reverseDiff(diff);
    expect(reversed).toContain(' unchanged');
    expect(reversed).toContain('+old');
  });
});

describe('hashContent', () => {
  test('same content produces same hash', () => {
    expect(hashContent('hello')).toBe(hashContent('hello'));
  });

  test('different content produces different hash', () => {
    expect(hashContent('hello')).not.toBe(hashContent('world'));
  });

  test('empty string has a hash', () => {
    const hash = hashContent('');
    expect(hash.length).toBeGreaterThan(0);
  });

  test('hash is hex string', () => {
    const hash = hashContent('test');
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });
});
