/**
 * Tests for Slice 5: Search model.
 */
import { describe, test, expect } from 'bun:test';
import {
  searchFileContent,
  totalMatchCount,
  computeReplace,
  isTextFile,
  SKIP_DIRS,
  DEFAULT_SEARCH_OPTIONS,
  groupByFile,
  type SearchOptions,
  type FileSearchResult,
} from '../src/search/search-model';

// =============================================================================
// searchFileContent — literal search
// =============================================================================

describe('searchFileContent (literal)', () => {
  const opts: SearchOptions = { ...DEFAULT_SEARCH_OPTIONS };

  test('finds single match', () => {
    const result = searchFileContent('hello world', 'world', opts);
    expect(result).not.toBeNull();
    expect(result!).toHaveLength(1);
    expect(result![0].line).toBe(1);
    expect(result![0].column).toBe(6);
    expect(result![0].length).toBe(5);
  });

  test('finds multiple matches on same line', () => {
    const result = searchFileContent('aa bb aa cc aa', 'aa', opts);
    expect(result).not.toBeNull();
    expect(result!).toHaveLength(3);
  });

  test('finds matches across lines', () => {
    const content = 'line one\nline two\nline three';
    const result = searchFileContent(content, 'line', opts);
    expect(result!).toHaveLength(3);
    expect(result![0].line).toBe(1);
    expect(result![1].line).toBe(2);
    expect(result![2].line).toBe(3);
  });

  test('returns null when no matches', () => {
    const result = searchFileContent('hello world', 'xyz', opts);
    expect(result).toBeNull();
  });

  test('returns null for empty query', () => {
    const result = searchFileContent('hello', '', opts);
    expect(result).toBeNull();
  });

  test('case-insensitive by default', () => {
    const result = searchFileContent('Hello World', 'hello', opts);
    expect(result).not.toBeNull();
    expect(result!).toHaveLength(1);
  });

  test('case-sensitive when enabled', () => {
    const csOpts: SearchOptions = { ...opts, caseSensitive: true };
    const result = searchFileContent('Hello World', 'hello', csOpts);
    expect(result).toBeNull();
  });

  test('case-sensitive finds exact match', () => {
    const csOpts: SearchOptions = { ...opts, caseSensitive: true };
    const result = searchFileContent('Hello World', 'Hello', csOpts);
    expect(result).not.toBeNull();
    expect(result!).toHaveLength(1);
  });

  test('escapes regex special chars in literal mode', () => {
    const result = searchFileContent('foo.bar(baz)', 'foo.bar(', opts);
    expect(result).not.toBeNull();
    expect(result!).toHaveLength(1);
    expect(result![0].length).toBe(8);
  });

  test('lineText contains full line', () => {
    const content = 'first line\nsecond line has match\nthird line';
    const result = searchFileContent(content, 'match', opts);
    expect(result![0].lineText).toBe('second line has match');
  });

  test('respects maxResults', () => {
    const content = 'aaa\naaa\naaa\naaa\naaa';
    const limitOpts: SearchOptions = { ...opts, maxResults: 3 };
    const result = searchFileContent(content, 'aaa', limitOpts);
    expect(result!).toHaveLength(3);
  });
});

// =============================================================================
// searchFileContent — whole word
// =============================================================================

describe('searchFileContent (wholeWord)', () => {
  const opts: SearchOptions = { ...DEFAULT_SEARCH_OPTIONS, wholeWord: true };

  test('matches whole word only', () => {
    const result = searchFileContent('cat category cats', 'cat', opts);
    expect(result).not.toBeNull();
    expect(result!).toHaveLength(1);
    expect(result![0].column).toBe(0);
  });

  test('matches word at end of line', () => {
    const result = searchFileContent('the big cat', 'cat', opts);
    expect(result!).toHaveLength(1);
  });

  test('no match when only substrings', () => {
    const result = searchFileContent('category concatenate', 'cat', opts);
    expect(result).toBeNull();
  });
});

// =============================================================================
// searchFileContent — regex
// =============================================================================

describe('searchFileContent (regex)', () => {
  const opts: SearchOptions = { ...DEFAULT_SEARCH_OPTIONS, regex: true };

  test('matches regex pattern', () => {
    const result = searchFileContent('foo123 bar456', '\\d+', opts);
    expect(result).not.toBeNull();
    expect(result!).toHaveLength(2);
    expect(result![0].length).toBe(3);
  });

  test('handles invalid regex gracefully', () => {
    const result = searchFileContent('hello', '[invalid', opts);
    expect(result).toBeNull();
  });

  test('regex with case insensitive', () => {
    const result = searchFileContent('Hello HELLO hello', 'hello', opts);
    expect(result!).toHaveLength(3);
  });

  test('regex case sensitive', () => {
    const csOpts: SearchOptions = { ...opts, caseSensitive: true };
    const result = searchFileContent('Hello HELLO hello', 'hello', csOpts);
    expect(result!).toHaveLength(1);
    expect(result![0].column).toBe(12);
  });

  test('regex whole word', () => {
    const wwOpts: SearchOptions = { ...opts, wholeWord: true };
    const result = searchFileContent('cat category', 'cat', wwOpts);
    expect(result!).toHaveLength(1);
  });

  test('regex character class', () => {
    const result = searchFileContent('abc 123 def', '[0-9]+', opts);
    expect(result!).toHaveLength(1);
    expect(result![0].column).toBe(4);
    expect(result![0].length).toBe(3);
  });

  test('regex alternation', () => {
    const result = searchFileContent('foo bar baz', 'foo|baz', opts);
    expect(result!).toHaveLength(2);
  });
});

// =============================================================================
// computeReplace
// =============================================================================

describe('computeReplace', () => {
  const opts: SearchOptions = { ...DEFAULT_SEARCH_OPTIONS };

  test('replaces all occurrences (literal)', () => {
    const result = computeReplace('foo bar foo baz foo', 'foo', 'qux', opts);
    expect(result).toBe('qux bar qux baz qux');
  });

  test('case-insensitive replace', () => {
    const result = computeReplace('Hello hello HELLO', 'hello', 'hi', opts);
    expect(result).toBe('hi hi hi');
  });

  test('case-sensitive replace', () => {
    const csOpts: SearchOptions = { ...opts, caseSensitive: true };
    const result = computeReplace('Hello hello HELLO', 'hello', 'hi', csOpts);
    expect(result).toBe('Hello hi HELLO');
  });

  test('regex replace', () => {
    const rxOpts: SearchOptions = { ...opts, regex: true };
    const result = computeReplace('foo123 bar456', '\\d+', 'NUM', rxOpts);
    expect(result).toBe('fooNUM barNUM');
  });

  test('whole word replace', () => {
    const wwOpts: SearchOptions = { ...opts, wholeWord: true };
    const result = computeReplace('cat category cats', 'cat', 'dog', wwOpts);
    expect(result).toBe('dog category cats');
  });

  test('returns original on empty query', () => {
    const result = computeReplace('hello', '', 'bye', opts);
    expect(result).toBe('hello');
  });

  test('handles regex special chars in replacement', () => {
    const result = computeReplace('foo', 'foo', '$1', opts);
    expect(result).toBe('$1');
  });

  test('handles invalid regex gracefully', () => {
    const rxOpts: SearchOptions = { ...opts, regex: true };
    const result = computeReplace('hello', '[bad', 'x', rxOpts);
    expect(result).toBe('hello');
  });

  test('multiline replace', () => {
    const content = 'line1 foo\nline2 foo\nline3 bar';
    const result = computeReplace(content, 'foo', 'baz', opts);
    expect(result).toBe('line1 baz\nline2 baz\nline3 bar');
  });
});

// =============================================================================
// totalMatchCount
// =============================================================================

describe('totalMatchCount', () => {
  test('counts across multiple files', () => {
    const results: FileSearchResult[] = [
      { filePath: 'a.ts', matches: [{ line: 1, column: 0, length: 3, lineText: 'foo' }] },
      { filePath: 'b.ts', matches: [
        { line: 1, column: 0, length: 3, lineText: 'foo' },
        { line: 2, column: 0, length: 3, lineText: 'foo' },
      ]},
    ];
    expect(totalMatchCount(results)).toBe(3);
  });

  test('returns 0 for empty results', () => {
    expect(totalMatchCount([])).toBe(0);
  });
});

// =============================================================================
// isTextFile
// =============================================================================

describe('isTextFile', () => {
  test('recognizes TypeScript files', () => {
    expect(isTextFile('app.ts')).toBe(true);
    expect(isTextFile('app.tsx')).toBe(true);
  });

  test('recognizes JavaScript files', () => {
    expect(isTextFile('app.js')).toBe(true);
    expect(isTextFile('app.jsx')).toBe(true);
    expect(isTextFile('app.mjs')).toBe(true);
  });

  test('recognizes common text files', () => {
    expect(isTextFile('README.md')).toBe(true);
    expect(isTextFile('style.css')).toBe(true);
    expect(isTextFile('config.json')).toBe(true);
    expect(isTextFile('Cargo.toml')).toBe(true);
    expect(isTextFile('config.yaml')).toBe(true);
    expect(isTextFile('index.html')).toBe(true);
  });

  test('recognizes Rust files', () => {
    expect(isTextFile('main.rs')).toBe(true);
  });

  test('recognizes Python files', () => {
    expect(isTextFile('main.py')).toBe(true);
  });

  test('rejects binary extensions', () => {
    expect(isTextFile('image.png')).toBe(false);
    expect(isTextFile('archive.zip')).toBe(false);
    expect(isTextFile('binary.wasm')).toBe(false);
  });

  test('rejects files with no extension', () => {
    expect(isTextFile('Makefile')).toBe(false);
  });

  test('recognizes dotfiles', () => {
    expect(isTextFile('.gitignore')).toBe(true);
    expect(isTextFile('.env')).toBe(true);
  });
});

// =============================================================================
// SKIP_DIRS
// =============================================================================

describe('groupByFile', () => {
  test('groups results by file path', () => {
    const results: FileSearchResult[] = [
      { filePath: 'a.ts', matches: [{ line: 1, column: 0, length: 3, lineText: 'foo' }] },
      { filePath: 'b.ts', matches: [{ line: 5, column: 2, length: 3, lineText: 'bar' }] },
    ];
    const map = groupByFile(results);
    expect(map.size).toBe(2);
    expect(map.get('a.ts')).toHaveLength(1);
    expect(map.get('b.ts')![0].line).toBe(5);
  });

  test('returns empty map for empty results', () => {
    const map = groupByFile([]);
    expect(map.size).toBe(0);
  });
});

describe('searchFileContent (zero-length regex)', () => {
  test('handles zero-length regex match without infinite loop', () => {
    const opts: SearchOptions = { ...DEFAULT_SEARCH_OPTIONS, regex: true };
    // Lookahead matches zero-length positions
    const result = searchFileContent('abc', '(?=a)', opts);
    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThan(0);
    expect(result![0].length).toBe(0);
  });
});

// SHIP-V1-GAPS.md #81: in-selection scope clamps the search range.
describe('searchFileContent (scope)', () => {
  const content = ['foo', 'foo', 'bar', 'foo', 'baz'].join('\n');
  test('returns all matches without scope', () => {
    const result = searchFileContent(content, 'foo', DEFAULT_SEARCH_OPTIONS);
    expect(result!.length).toBe(3);
  });

  test('restricts matches to scopeStartLine..scopeEndLine (inclusive)', () => {
    const opts: SearchOptions = { ...DEFAULT_SEARCH_OPTIONS, scopeStartLine: 2, scopeEndLine: 4 };
    const result = searchFileContent(content, 'foo', opts);
    expect(result!.length).toBe(2);
    expect(result![0].line).toBe(2);
    expect(result![1].line).toBe(4);
  });

  test('scopeStartLine 0 means whole document', () => {
    const opts: SearchOptions = { ...DEFAULT_SEARCH_OPTIONS, scopeStartLine: 0, scopeEndLine: 0 };
    const result = searchFileContent(content, 'foo', opts);
    expect(result!.length).toBe(3);
  });

  test('handles inverted range gracefully', () => {
    const opts: SearchOptions = { ...DEFAULT_SEARCH_OPTIONS, scopeStartLine: 4, scopeEndLine: 2 };
    const result = searchFileContent(content, 'foo', opts);
    // Inverted → treated as "no scope".
    expect(result!.length).toBe(3);
  });
});

describe('SKIP_DIRS', () => {
  test('includes common skip directories', () => {
    expect(SKIP_DIRS.has('node_modules')).toBe(true);
    expect(SKIP_DIRS.has('.git')).toBe(true);
    expect(SKIP_DIRS.has('dist')).toBe(true);
    expect(SKIP_DIRS.has('target')).toBe(true);
    expect(SKIP_DIRS.has('__pycache__')).toBe(true);
  });

  test('does not include src', () => {
    expect(SKIP_DIRS.has('src')).toBe(false);
  });
});

// =============================================================================
// RipgrepSearcher
// =============================================================================

import { RipgrepSearcher } from '../src/search/ripgrep';

describe('RipgrepSearcher.buildArgs', () => {
  const rg = new RipgrepSearcher();

  test('default options', () => {
    const args = rg.buildArgs('hello');
    expect(args).toContain('--json');
    expect(args).toContain('--ignore-case');
    expect(args).toContain('--fixed-strings');
    expect(args).toContain('hello');
    expect(args).not.toContain('--case-sensitive');
    expect(args).not.toContain('--word-regexp');
  });

  test('caseSensitive', () => {
    const args = rg.buildArgs('hello', { caseSensitive: true });
    expect(args).toContain('--case-sensitive');
    expect(args).not.toContain('--ignore-case');
  });

  test('wholeWord', () => {
    const args = rg.buildArgs('hello', { wholeWord: true });
    expect(args).toContain('--word-regexp');
  });

  test('regex mode', () => {
    const args = rg.buildArgs('foo.*bar', { regex: true });
    expect(args).toContain('--regexp');
    expect(args).toContain('foo.*bar');
    expect(args).not.toContain('--fixed-strings');
  });

  test('include/exclude globs', () => {
    const args = rg.buildArgs('hello', {
      include: ['*.ts', '*.js'],
      exclude: ['node_modules'],
    });
    expect(args).toContain('--glob');
    expect(args).toContain('*.ts');
    expect(args).toContain('*.js');
    expect(args).toContain('!node_modules');
  });

  test('maxResults', () => {
    const args = rg.buildArgs('hello', { maxResults: 50 });
    expect(args).toContain('--max-count');
    expect(args).toContain('50');
  });
});

describe('RipgrepSearcher.parseJsonLines', () => {
  test('parses match lines', () => {
    const output = [
      JSON.stringify({
        type: 'match',
        data: {
          path: { text: '/src/app.ts' },
          lines: { text: 'const hello = "world";\n' },
          line_number: 5,
          submatches: [
            { match: { text: 'hello' }, start: 6, end: 11 },
          ],
        },
      }),
      JSON.stringify({ type: 'begin', data: { path: { text: '/src/app.ts' } } }),
      JSON.stringify({
        type: 'match',
        data: {
          path: { text: '/src/app.ts' },
          lines: { text: 'function hello() {}\n' },
          line_number: 10,
          submatches: [
            { match: { text: 'hello' }, start: 9, end: 14 },
          ],
        },
      }),
    ].join('\n');

    const results = RipgrepSearcher.parseJsonLines(output);
    expect(results.has('/src/app.ts')).toBe(true);
    const matches = results.get('/src/app.ts')!;
    expect(matches).toHaveLength(2);
    expect(matches[0].line).toBe(5);
    expect(matches[0].column).toBe(6);
    expect(matches[0].length).toBe(5);
    expect(matches[0].lineText).toBe('const hello = "world";');
    expect(matches[1].line).toBe(10);
  });

  test('returns empty map for empty input', () => {
    const results = RipgrepSearcher.parseJsonLines('');
    expect(results.size).toBe(0);
  });
});
