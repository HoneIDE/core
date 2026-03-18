/**
 * Built-in document formatting rules.
 *
 * Pure TypeScript, Perry-safe (no regex). Operates on full file content string.
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
 * Implementation: splits by newline (charCodeAt loop), processes each line, rejoins.
 */
export function formatDocument(content: string, options: FormattingOptions): FormattingResult {
  if (content.length === 0) {
    if (options.insertFinalNewline) {
      return { formatted: '\n', changed: true };
    }
    return { formatted: '', changed: false };
  }

  // Split content into lines by scanning for \n (charCode 10)
  const lines: string[] = [];
  let lineStart = 0;
  for (let i = 0; i <= content.length; i++) {
    if (i === content.length || content.charCodeAt(i) === 10) {
      lines.push(content.slice(lineStart, i));
      lineStart = i + 1;
    }
  }

  // Process each line
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Trim trailing whitespace
    if (options.trimTrailingWhitespace) {
      line = trimTrailing(line);
    }

    // Normalize indentation (tabs↔spaces)
    if (options.normalizeIndentation) {
      line = normalizeLineIndent(line, options.tabSize, options.insertSpaces);
    }

    lines[i] = line;
  }

  // Trim final newlines: remove trailing empty lines, keep at most one
  if (options.trimFinalNewlines) {
    while (lines.length > 1 && lines[lines.length - 1].length === 0) {
      lines.pop();
    }
  }

  // Max consecutive blank lines
  if (options.maxConsecutiveBlankLines > 0) {
    const result: string[] = [];
    let blankCount = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length === 0) {
        blankCount++;
        if (blankCount <= options.maxConsecutiveBlankLines) {
          result.push(lines[i]);
        }
      } else {
        blankCount = 0;
        result.push(lines[i]);
      }
    }
    lines.length = 0;
    for (let i = 0; i < result.length; i++) {
      lines.push(result[i]);
    }
  }

  // Rejoin
  let formatted = '';
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) formatted += '\n';
    formatted += lines[i];
  }

  // Insert final newline
  if (options.insertFinalNewline) {
    if (formatted.length === 0 || formatted.charCodeAt(formatted.length - 1) !== 10) {
      formatted += '\n';
    }
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
  const lines: string[] = [];
  let lineStart = 0;
  for (let i = 0; i <= content.length; i++) {
    if (i === content.length || content.charCodeAt(i) === 10) {
      lines.push(trimTrailing(content.slice(lineStart, i)));
      lineStart = i + 1;
    }
  }
  let result = '';
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) result += '\n';
    result += lines[i];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Remove trailing spaces (32) and tabs (9) from a line. */
function trimTrailing(line: string): string {
  let end = line.length;
  while (end > 0) {
    const ch = line.charCodeAt(end - 1);
    if (ch === 32 || ch === 9) {
      end--;
    } else {
      break;
    }
  }
  if (end === line.length) return line;
  return line.slice(0, end);
}

/** Normalize a line's leading indentation: tabs→spaces or spaces→tabs. */
function normalizeLineIndent(line: string, tabSize: number, insertSpaces: boolean): string {
  if (line.length === 0) return line;

  // Count leading whitespace and compute indent level
  let spaces = 0;
  let idx = 0;
  while (idx < line.length) {
    const ch = line.charCodeAt(idx);
    if (ch === 32) {
      spaces++;
      idx++;
    } else if (ch === 9) {
      spaces += tabSize;
      idx++;
    } else {
      break;
    }
  }

  if (idx === 0) return line; // No leading whitespace

  const rest = line.slice(idx);

  if (insertSpaces) {
    // Convert to spaces
    let indent = '';
    for (let i = 0; i < spaces; i++) {
      indent += ' ';
    }
    return indent + rest;
  } else {
    // Convert to tabs + remainder spaces
    const tabs = (spaces / tabSize) | 0;
    const remainder = spaces - tabs * tabSize;
    let indent = '';
    for (let i = 0; i < tabs; i++) {
      indent += '\t';
    }
    for (let i = 0; i < remainder; i++) {
      indent += ' ';
    }
    return indent + rest;
  }
}
