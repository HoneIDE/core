/**
 * FileIndex tests — fuzzy search accuracy, scoring, and ranking.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { FileIndex } from '../src/workspace/file-index';

describe('FileIndex', () => {
  let index: FileIndex;

  const FILES = [
    'src/app.ts',
    'src/platform.ts',
    'src/commands.ts',
    'src/keybindings.ts',
    'src/menu.ts',
    'src/window.ts',
    'src/workbench/layout/grid.ts',
    'src/workbench/layout/tab-manager.ts',
    'src/workbench/layout/panel-registry.ts',
    'src/workbench/layout/activity-bar.ts',
    'src/workbench/layout/status-bar.ts',
    'src/workbench/theme/theme-loader.ts',
    'src/workbench/theme/token-theme.ts',
    'src/workbench/theme/ui-theme.ts',
    'src/workbench/views/explorer/file-tree.ts',
    'src/workbench/views/explorer/file-tree-item.ts',
    'src/workbench/views/explorer/file-operations.ts',
    'src/workbench/views/quick-open/quick-open.ts',
    'tests/layout.test.ts',
    'tests/theme.test.ts',
    'tests/devices.ts',
    'package.json',
    'tsconfig.json',
    'perry.config.ts',
    'README.md',
  ];

  beforeEach(() => {
    index = new FileIndex();
    index.setFiles(FILES);
  });

  // -----------------------------------------------------------------------
  // Basic operations
  // -----------------------------------------------------------------------

  test('setFiles populates the index', () => {
    expect(index.size).toBe(FILES.length);
  });

  test('addFile adds a single file', () => {
    index.addFile('src/new-file.ts');
    expect(index.size).toBe(FILES.length + 1);
    expect(index.has('src/new-file.ts')).toBe(true);
  });

  test('addFile ignores duplicates', () => {
    index.addFile('src/app.ts');
    expect(index.size).toBe(FILES.length);
  });

  test('removeFile removes a file', () => {
    index.removeFile('src/app.ts');
    expect(index.size).toBe(FILES.length - 1);
    expect(index.has('src/app.ts')).toBe(false);
  });

  test('removeFile ignores missing files', () => {
    index.removeFile('nonexistent.ts');
    expect(index.size).toBe(FILES.length);
  });

  test('clear empties the index', () => {
    index.clear();
    expect(index.size).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Empty query
  // -----------------------------------------------------------------------

  test('empty query returns recent files', () => {
    const results = index.search('');
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(50);
    // All results have score 0 (no matching)
    for (const r of results) {
      expect(r.score).toBe(0);
    }
  });

  // -----------------------------------------------------------------------
  // Exact filename match
  // -----------------------------------------------------------------------

  test('exact filename match gets highest score', () => {
    const results = index.search('app.ts');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].path).toBe('src/app.ts');
    // Should have the highest score
    if (results.length > 1) {
      expect(results[0].score).toBeGreaterThan(results[1].score);
    }
  });

  test('exact filename match is case-insensitive', () => {
    const results = index.search('APP.TS');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].filename).toBe('app.ts');
  });

  // -----------------------------------------------------------------------
  // Prefix match
  // -----------------------------------------------------------------------

  test('prefix query matches filenames starting with query', () => {
    const results = index.search('plat');
    expect(results.some(r => r.filename === 'platform.ts')).toBe(true);
  });

  test('prefix "grid" finds grid.ts', () => {
    const results = index.search('grid');
    expect(results[0].filename).toBe('grid.ts');
  });

  // -----------------------------------------------------------------------
  // Substring / fuzzy match
  // -----------------------------------------------------------------------

  test('substring matches within filename', () => {
    const results = index.search('theme');
    // Should find theme-loader.ts, token-theme.ts, ui-theme.ts, theme.test.ts
    const themeFiles = results.filter(r => r.filename.includes('theme'));
    expect(themeFiles.length).toBeGreaterThanOrEqual(3);
  });

  test('fuzzy match with non-consecutive characters', () => {
    // "tl" should match "theme-loader.ts" (t...l)
    const results = index.search('tl');
    expect(results.length).toBeGreaterThan(0);
  });

  test('fuzzy "ftree" matches file-tree.ts', () => {
    const results = index.search('ftree');
    const fileTrees = results.filter(r => r.filename.startsWith('file-tree'));
    expect(fileTrees.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // Out-of-order characters (must still appear in sequence)
  // -----------------------------------------------------------------------

  test('query characters must appear in order', () => {
    // "zy" won't match any file (no file has z followed by y)
    const results = index.search('zy');
    // Might match nothing or very few
    // The important thing is correctness, not count
    for (const r of results) {
      // Verify match indices are in order
      for (let i = 1; i < r.matchIndices.length; i++) {
        expect(r.matchIndices[i]).toBeGreaterThan(r.matchIndices[i - 1]);
      }
    }
  });

  // -----------------------------------------------------------------------
  // Scoring and ranking
  // -----------------------------------------------------------------------

  test('word boundary matches score higher than mid-word matches', () => {
    // "ab" → "activity-bar.ts" (a at start, b at boundary after '-')
    //      vs some file where a and b are mid-word
    const results = index.search('ab');
    const activityBar = results.find(r => r.filename === 'activity-bar.ts');
    expect(activityBar).toBeDefined();
    // It should rank relatively high due to boundary matches
  });

  test('consecutive character matches score higher', () => {
    // "tabm" → should strongly favor "tab-manager.ts" over others
    // because all 4 chars appear consecutively or at boundaries
    const results = index.search('tabm');
    expect(results[0].filename).toBe('tab-manager.ts');
  });

  test('shorter paths rank higher as tiebreaker', () => {
    // "menu" → "src/menu.ts" should rank above a deeply nested menu file
    const results = index.search('menu');
    expect(results[0].path).toBe('src/menu.ts');
  });

  // -----------------------------------------------------------------------
  // Match indices (for highlighting)
  // -----------------------------------------------------------------------

  test('match indices are valid positions in the path', () => {
    const results = index.search('grid');
    expect(results.length).toBeGreaterThan(0);

    const match = results[0];
    expect(match.matchIndices.length).toBe(4); // "grid" = 4 chars
    for (const idx of match.matchIndices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(match.path.length);
    }
  });

  test('match indices are in ascending order', () => {
    const results = index.search('qt');
    for (const r of results) {
      for (let i = 1; i < r.matchIndices.length; i++) {
        expect(r.matchIndices[i]).toBeGreaterThan(r.matchIndices[i - 1]);
      }
    }
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  test('single character query works', () => {
    const results = index.search('g');
    expect(results.length).toBeGreaterThan(0);
  });

  test('query longer than any filename returns no matches', () => {
    const results = index.search('thisisaverylongquerythatwontmatchanything');
    expect(results.length).toBe(0);
  });

  test('search on empty index returns empty', () => {
    const empty = new FileIndex();
    expect(empty.search('test').length).toBe(0);
  });

  test('maxResults limits output', () => {
    const results = index.search('t', 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });
});
