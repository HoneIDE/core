/**
 * Tests for formatting rules, language presets, and indent detector integration.
 */
import { describe, test, expect } from 'bun:test';
import {
  formatDocument, defaultFormattingOptions, trimTrailingWhitespaceOnly,
  type FormattingOptions,
} from '../src/formatting/formatting-rules';
import { getLanguagePreset } from '../src/formatting/language-presets';
import { detectIndentation } from '../src/formatting/indent-detector';

// =============================================================================
// formatDocument — individual rules
// =============================================================================

describe('formatDocument — trimTrailingWhitespace', () => {
  test('removes trailing spaces', () => {
    const opts = defaultFormattingOptions();
    opts.insertFinalNewline = false;
    opts.trimFinalNewlines = false;
    const r = formatDocument('hello   \nworld  \n', opts);
    expect(r.formatted).toBe('hello\nworld\n');
    expect(r.changed).toBe(true);
  });

  test('removes trailing tabs', () => {
    const opts = defaultFormattingOptions();
    opts.insertFinalNewline = false;
    opts.trimFinalNewlines = false;
    const r = formatDocument('hello\t\t\n', opts);
    expect(r.formatted).toBe('hello\n');
    expect(r.changed).toBe(true);
  });

  test('preserves leading whitespace', () => {
    const opts = defaultFormattingOptions();
    opts.insertFinalNewline = false;
    opts.trimFinalNewlines = false;
    const r = formatDocument('  hello  \n', opts);
    expect(r.formatted).toBe('  hello\n');
  });

  test('no change when no trailing whitespace', () => {
    const opts = defaultFormattingOptions();
    opts.insertFinalNewline = false;
    opts.trimFinalNewlines = false;
    const r = formatDocument('hello\nworld\n', opts);
    expect(r.formatted).toBe('hello\nworld\n');
    expect(r.changed).toBe(false);
  });

  test('disabled: preserves trailing whitespace', () => {
    const opts = defaultFormattingOptions();
    opts.trimTrailingWhitespace = false;
    opts.insertFinalNewline = false;
    opts.trimFinalNewlines = false;
    const r = formatDocument('hello   \n', opts);
    expect(r.formatted).toBe('hello   \n');
    expect(r.changed).toBe(false);
  });
});

describe('formatDocument — insertFinalNewline', () => {
  test('adds newline when missing', () => {
    const opts = defaultFormattingOptions();
    opts.trimTrailingWhitespace = false;
    opts.trimFinalNewlines = false;
    const r = formatDocument('hello', opts);
    expect(r.formatted).toBe('hello\n');
    expect(r.changed).toBe(true);
  });

  test('no change when newline exists', () => {
    const opts = defaultFormattingOptions();
    opts.trimTrailingWhitespace = false;
    opts.trimFinalNewlines = false;
    const r = formatDocument('hello\n', opts);
    expect(r.formatted).toBe('hello\n');
    expect(r.changed).toBe(false);
  });

  test('disabled: does not add newline', () => {
    const opts = defaultFormattingOptions();
    opts.insertFinalNewline = false;
    opts.trimTrailingWhitespace = false;
    opts.trimFinalNewlines = false;
    const r = formatDocument('hello', opts);
    expect(r.formatted).toBe('hello');
    expect(r.changed).toBe(false);
  });
});

describe('formatDocument — trimFinalNewlines', () => {
  test('removes multiple trailing blank lines', () => {
    const opts = defaultFormattingOptions();
    opts.trimTrailingWhitespace = false;
    const r = formatDocument('hello\n\n\n\n', opts);
    expect(r.formatted).toBe('hello\n');
    expect(r.changed).toBe(true);
  });

  test('single trailing newline preserved', () => {
    const opts = defaultFormattingOptions();
    opts.trimTrailingWhitespace = false;
    const r = formatDocument('hello\n', opts);
    expect(r.formatted).toBe('hello\n');
    expect(r.changed).toBe(false);
  });

  test('disabled: keeps trailing blank lines', () => {
    const opts = defaultFormattingOptions();
    opts.trimFinalNewlines = false;
    opts.trimTrailingWhitespace = false;
    const r = formatDocument('hello\n\n\n', opts);
    expect(r.formatted).toBe('hello\n\n\n');
    expect(r.changed).toBe(false);
  });
});

describe('formatDocument — normalizeIndentation', () => {
  test('tabs to spaces', () => {
    const opts = defaultFormattingOptions();
    opts.normalizeIndentation = true;
    opts.insertSpaces = true;
    opts.tabSize = 4;
    opts.insertFinalNewline = false;
    opts.trimFinalNewlines = false;
    const r = formatDocument('\thello\n', opts);
    expect(r.formatted).toBe('    hello\n');
    expect(r.changed).toBe(true);
  });

  test('spaces to tabs', () => {
    const opts = defaultFormattingOptions();
    opts.normalizeIndentation = true;
    opts.insertSpaces = false;
    opts.tabSize = 4;
    opts.insertFinalNewline = false;
    opts.trimFinalNewlines = false;
    const r = formatDocument('    hello\n', opts);
    expect(r.formatted).toBe('\thello\n');
    expect(r.changed).toBe(true);
  });

  test('mixed indent to spaces', () => {
    const opts = defaultFormattingOptions();
    opts.normalizeIndentation = true;
    opts.insertSpaces = true;
    opts.tabSize = 4;
    opts.insertFinalNewline = false;
    opts.trimFinalNewlines = false;
    const r = formatDocument('\t  hello\n', opts);
    expect(r.formatted).toBe('      hello\n');
    expect(r.changed).toBe(true);
  });

  test('spaces to tabs with remainder', () => {
    const opts = defaultFormattingOptions();
    opts.normalizeIndentation = true;
    opts.insertSpaces = false;
    opts.tabSize = 4;
    opts.insertFinalNewline = false;
    opts.trimFinalNewlines = false;
    // 6 spaces = 1 tab + 2 spaces
    const r = formatDocument('      hello\n', opts);
    expect(r.formatted).toBe('\t  hello\n');
  });

  test('disabled: no change', () => {
    const opts = defaultFormattingOptions();
    opts.normalizeIndentation = false;
    opts.insertFinalNewline = false;
    opts.trimFinalNewlines = false;
    opts.trimTrailingWhitespace = false;
    const r = formatDocument('\thello\n', opts);
    expect(r.formatted).toBe('\thello\n');
    expect(r.changed).toBe(false);
  });
});

describe('formatDocument — maxConsecutiveBlankLines', () => {
  test('collapses 3 blank lines to 1', () => {
    const opts = defaultFormattingOptions();
    opts.maxConsecutiveBlankLines = 1;
    opts.trimFinalNewlines = false;
    opts.insertFinalNewline = false;
    opts.trimTrailingWhitespace = false;
    const r = formatDocument('a\n\n\n\nb\n', opts);
    expect(r.formatted).toBe('a\n\nb\n');
    expect(r.changed).toBe(true);
  });

  test('collapses to 2 blank lines', () => {
    const opts = defaultFormattingOptions();
    opts.maxConsecutiveBlankLines = 2;
    opts.trimFinalNewlines = false;
    opts.insertFinalNewline = false;
    opts.trimTrailingWhitespace = false;
    const r = formatDocument('a\n\n\n\n\nb\n', opts);
    expect(r.formatted).toBe('a\n\n\nb\n');
    expect(r.changed).toBe(true);
  });

  test('0 disables blank line collapsing', () => {
    const opts = defaultFormattingOptions();
    opts.maxConsecutiveBlankLines = 0;
    opts.trimFinalNewlines = false;
    opts.insertFinalNewline = false;
    opts.trimTrailingWhitespace = false;
    const r = formatDocument('a\n\n\n\nb\n', opts);
    expect(r.formatted).toBe('a\n\n\n\nb\n');
    expect(r.changed).toBe(false);
  });
});

// =============================================================================
// formatDocument — combinations
// =============================================================================

describe('formatDocument — combined rules', () => {
  test('trim whitespace + insert final newline', () => {
    const opts = defaultFormattingOptions();
    opts.trimFinalNewlines = false;
    const r = formatDocument('hello   ', opts);
    expect(r.formatted).toBe('hello\n');
    expect(r.changed).toBe(true);
  });

  test('all defaults on clean file', () => {
    const opts = defaultFormattingOptions();
    const r = formatDocument('hello\nworld\n', opts);
    expect(r.formatted).toBe('hello\nworld\n');
    expect(r.changed).toBe(false);
  });

  test('all rules applied together', () => {
    const opts: FormattingOptions = {
      tabSize: 2,
      insertSpaces: true,
      trimTrailingWhitespace: true,
      insertFinalNewline: true,
      trimFinalNewlines: true,
      normalizeIndentation: true,
      maxConsecutiveBlankLines: 1,
    };
    const r = formatDocument('\thello   \n\n\n\n\tworld\t\n\n', opts);
    expect(r.formatted).toBe('  hello\n\n  world\n');
    expect(r.changed).toBe(true);
  });
});

// =============================================================================
// Edge cases
// =============================================================================

describe('formatDocument — edge cases', () => {
  test('empty file with insertFinalNewline', () => {
    const opts = defaultFormattingOptions();
    const r = formatDocument('', opts);
    expect(r.formatted).toBe('\n');
    expect(r.changed).toBe(true);
  });

  test('empty file without insertFinalNewline', () => {
    const opts = defaultFormattingOptions();
    opts.insertFinalNewline = false;
    const r = formatDocument('', opts);
    expect(r.formatted).toBe('');
    expect(r.changed).toBe(false);
  });

  test('single line no newline', () => {
    const opts = defaultFormattingOptions();
    const r = formatDocument('hello', opts);
    expect(r.formatted).toBe('hello\n');
    expect(r.changed).toBe(true);
  });

  test('only whitespace lines', () => {
    const opts = defaultFormattingOptions();
    const r = formatDocument('   \n   \n', opts);
    expect(r.formatted).toBe('\n');
  });

  test('file with only newlines', () => {
    const opts = defaultFormattingOptions();
    const r = formatDocument('\n\n\n', opts);
    expect(r.formatted).toBe('\n');
    expect(r.changed).toBe(true);
  });
});

// =============================================================================
// trimTrailingWhitespaceOnly
// =============================================================================

describe('trimTrailingWhitespaceOnly', () => {
  test('trims spaces from each line', () => {
    const r = trimTrailingWhitespaceOnly('hello   \nworld  \n');
    expect(r).toBe('hello\nworld\n');
  });

  test('preserves leading whitespace', () => {
    const r = trimTrailingWhitespaceOnly('  hello  \n');
    expect(r).toBe('  hello\n');
  });

  test('no change needed', () => {
    const r = trimTrailingWhitespaceOnly('hello\nworld\n');
    expect(r).toBe('hello\nworld\n');
  });
});

// =============================================================================
// Language presets
// =============================================================================

describe('getLanguagePreset', () => {
  test('typescript: 2 spaces', () => {
    const p = getLanguagePreset('typescript');
    expect(p.tabSize).toBe(2);
    expect(p.insertSpaces).toBe(true);
  });

  test('javascript: 2 spaces', () => {
    const p = getLanguagePreset('javascript');
    expect(p.tabSize).toBe(2);
    expect(p.insertSpaces).toBe(true);
  });

  test('json: 2 spaces', () => {
    const p = getLanguagePreset('json');
    expect(p.tabSize).toBe(2);
    expect(p.insertSpaces).toBe(true);
  });

  test('html: 2 spaces', () => {
    const p = getLanguagePreset('html');
    expect(p.tabSize).toBe(2);
    expect(p.insertSpaces).toBe(true);
  });

  test('css: 2 spaces', () => {
    const p = getLanguagePreset('css');
    expect(p.tabSize).toBe(2);
    expect(p.insertSpaces).toBe(true);
  });

  test('yaml: 2 spaces', () => {
    const p = getLanguagePreset('yaml');
    expect(p.tabSize).toBe(2);
    expect(p.insertSpaces).toBe(true);
  });

  test('markdown: 2 spaces', () => {
    const p = getLanguagePreset('markdown');
    expect(p.tabSize).toBe(2);
    expect(p.insertSpaces).toBe(true);
  });

  test('python: 4 spaces', () => {
    const p = getLanguagePreset('python');
    expect(p.tabSize).toBe(4);
    expect(p.insertSpaces).toBe(true);
  });

  test('rust: 4 spaces', () => {
    const p = getLanguagePreset('rust');
    expect(p.tabSize).toBe(4);
    expect(p.insertSpaces).toBe(true);
  });

  test('java: 4 spaces', () => {
    const p = getLanguagePreset('java');
    expect(p.tabSize).toBe(4);
    expect(p.insertSpaces).toBe(true);
  });

  test('go: 4 tabs', () => {
    const p = getLanguagePreset('go');
    expect(p.tabSize).toBe(4);
    expect(p.insertSpaces).toBe(false);
  });

  test('c: 4 spaces', () => {
    const p = getLanguagePreset('c');
    expect(p.tabSize).toBe(4);
    expect(p.insertSpaces).toBe(true);
  });

  test('cpp: 4 spaces', () => {
    const p = getLanguagePreset('cpp');
    expect(p.tabSize).toBe(4);
    expect(p.insertSpaces).toBe(true);
  });

  test('swift: 4 spaces', () => {
    const p = getLanguagePreset('swift');
    expect(p.tabSize).toBe(4);
    expect(p.insertSpaces).toBe(true);
  });

  test('php: 4 spaces', () => {
    const p = getLanguagePreset('php');
    expect(p.tabSize).toBe(4);
    expect(p.insertSpaces).toBe(true);
  });

  test('shell: 2 spaces', () => {
    const p = getLanguagePreset('shell');
    expect(p.tabSize).toBe(2);
    expect(p.insertSpaces).toBe(true);
  });

  test('ruby: 2 spaces', () => {
    const p = getLanguagePreset('ruby');
    expect(p.tabSize).toBe(2);
    expect(p.insertSpaces).toBe(true);
  });

  test('unknown language: 2 spaces default', () => {
    const p = getLanguagePreset('brainfuck');
    expect(p.tabSize).toBe(2);
    expect(p.insertSpaces).toBe(true);
  });

  test('empty string: 2 spaces default', () => {
    const p = getLanguagePreset('');
    expect(p.tabSize).toBe(2);
    expect(p.insertSpaces).toBe(true);
  });
});

// =============================================================================
// Integration with detectIndentation
// =============================================================================

describe('detectIndentation + formatDocument integration', () => {
  test('detect tabs then normalize to spaces', () => {
    const content = '\tfunction a() {\n\t\treturn 1;\n\t}\n';
    const detected = detectIndentation(content);
    expect(detected.useTabs).toBe(true);

    const opts = defaultFormattingOptions();
    opts.normalizeIndentation = true;
    opts.insertSpaces = true;
    opts.tabSize = detected.tabSize;
    const r = formatDocument(content, opts);
    // Should not contain any tabs
    expect(r.formatted.indexOf('\t')).toBe(-1);
    expect(r.changed).toBe(true);
  });

  test('detect 2-space then normalize to 4-space (via tabs)', () => {
    const content = '  function a() {\n    return 1;\n  }\n';
    const detected = detectIndentation(content);
    expect(detected.useTabs).toBe(false);
    expect(detected.tabSize).toBe(2);

    // Now format with 4-space intent via normalize
    const opts = defaultFormattingOptions();
    opts.normalizeIndentation = true;
    opts.insertSpaces = true;
    opts.tabSize = 4;
    const r = formatDocument(content, opts);
    // 2 spaces stay as 2 spaces since normalizeIndentation counts total spaces
    // and tabSize only affects tab→space conversion
    expect(r.formatted).toBe('  function a() {\n    return 1;\n  }\n');
  });
});
