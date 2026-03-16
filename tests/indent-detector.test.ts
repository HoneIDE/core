import { describe, test, expect } from 'bun:test';
import { detectIndentation } from '../src/formatting/indent-detector';

describe('detectIndentation', () => {
  test('detects 2-space indent', () => {
    const content = `function foo() {
  const x = 1;
  if (x) {
    return x;
  }
}`;
    const result = detectIndentation(content);
    expect(result.useTabs).toBe(false);
    expect(result.tabSize).toBe(2);
  });

  test('detects 4-space indent', () => {
    const content = `function foo() {
    const x = 1;
    if (x) {
        return x;
    }
}`;
    const result = detectIndentation(content);
    expect(result.useTabs).toBe(false);
    expect(result.tabSize).toBe(4);
  });

  test('detects tab indent', () => {
    const content = `function foo() {
\tconst x = 1;
\tif (x) {
\t\treturn x;
\t}
}`;
    const result = detectIndentation(content);
    expect(result.useTabs).toBe(true);
  });

  test('defaults to 2 spaces for empty file', () => {
    const result = detectIndentation('');
    expect(result.useTabs).toBe(false);
    expect(result.tabSize).toBe(2);
  });

  test('defaults to 2 spaces for no-indent file', () => {
    const content = `line one
line two
line three`;
    const result = detectIndentation(content);
    expect(result.useTabs).toBe(false);
    expect(result.tabSize).toBe(2);
  });

  test('tabs win over spaces when majority', () => {
    const content = `\tline1
\tline2
\tline3
  line4`;
    const result = detectIndentation(content);
    expect(result.useTabs).toBe(true);
  });

  test('respects maxLines limit', () => {
    let content = '';
    for (let i = 0; i < 200; i++) {
      content += '    line' + i + '\n';
    }
    // With maxLines=10, should still detect
    const result = detectIndentation(content, 10);
    expect(result.useTabs).toBe(false);
    expect(result.tabSize).toBe(4);
  });

  test('ignores blank lines', () => {
    const content = `function foo() {
  x = 1;

  y = 2;
}`;
    const result = detectIndentation(content);
    expect(result.useTabs).toBe(false);
    expect(result.tabSize).toBe(2);
  });
});
