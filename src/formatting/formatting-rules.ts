/**
 * Built-in document formatting rules.
 *
 * Pure TypeScript. Operates on full file content string.
 * Each rule is independently toggleable via FormattingOptions.
 */

export interface FormattingOptions {
  tabSize: number;
  insertSpaces: boolean;
  trimTrailingWhitespace: boolean;
  insertFinalNewline: boolean;
  trimFinalNewlines: boolean;
  normalizeIndentation: boolean;
  maxConsecutiveBlankLines: number; // 0 = disabled
}

export interface FormattingResult {
  formatted: string;
  changed: boolean;
}

/** Default formatting options. */
export function defaultFormattingOptions(): FormattingOptions {
  return {
    tabSize: 2,
    insertSpaces: true,
    trimTrailingWhitespace: true,
    insertFinalNewline: true,
    trimFinalNewlines: true,
    normalizeIndentation: false,
    maxConsecutiveBlankLines: 0,
  };
}

/**
 * Format a document according to the given options.
 *
 * Implementation: splits by newline, processes each line, rejoins.
 */
export function formatDocument(content: string, options: FormattingOptions): FormattingResult {
  if (content.length === 0) {
    if (options.insertFinalNewline) {
      return { formatted: '\n', changed: true };
    }
    return { formatted: '', changed: false };
  }

  let lines = content.split('\n');

  // Process each line: trim trailing whitespace, normalize indentation.
  lines = lines.map(line => {
    let out = line;
    if (options.trimTrailingWhitespace) out = trimTrailing(out);
    if (options.normalizeIndentation) out = normalizeLineIndent(out, options.tabSize, options.insertSpaces);
    return out;
  });

  // Trim final newlines: remove trailing empty lines, keep at most one.
  if (options.trimFinalNewlines) {
    while (lines.length > 1 && lines[lines.length - 1].length === 0) {
      lines.pop();
    }
  }

  // Max consecutive blank lines.
  if (options.maxConsecutiveBlankLines > 0) {
    const result: string[] = [];
    let blankCount = 0;
    for (const line of lines) {
      if (line.length === 0) {
        blankCount++;
        if (blankCount <= options.maxConsecutiveBlankLines) result.push(line);
      } else {
        blankCount = 0;
        result.push(line);
      }
    }
    lines = result;
  }

  let formatted = lines.join('\n');

  // Insert final newline.
  if (options.insertFinalNewline && !formatted.endsWith('\n')) {
    formatted += '\n';
  }

  return {
    formatted,
    changed: formatted !== content,
  };
}

/**
 * Trim trailing whitespace only (no other formatting).
 * Useful for the independent "trim trailing whitespace on save" setting.
 */
export function trimTrailingWhitespaceOnly(content: string): string {
  return content.split('\n').map(trimTrailing).join('\n');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Remove trailing spaces and tabs from a line. */
function trimTrailing(line: string): string {
  return line.replace(/[ \t]+$/, '');
}

/** Normalize a line's leading indentation: tabs→spaces or spaces→tabs. */
function normalizeLineIndent(line: string, tabSize: number, insertSpaces: boolean): string {
  const leading = line.match(/^[ \t]*/)![0];
  if (leading.length === 0) return line; // No leading whitespace

  // Compute total space-equivalent width (each tab counts as tabSize spaces).
  let spaces = 0;
  for (const ch of leading) {
    spaces += ch === '\t' ? tabSize : 1;
  }

  const rest = line.slice(leading.length);

  if (insertSpaces) {
    return ' '.repeat(spaces) + rest;
  }
  // Convert to tabs + remainder spaces.
  const tabs = Math.floor(spaces / tabSize);
  const remainder = spaces - tabs * tabSize;
  return '\t'.repeat(tabs) + ' '.repeat(remainder) + rest;
}
