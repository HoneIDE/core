/**
 * Indentation detector — scans a file to determine its indentation style.
 *
 * Examines the first N lines and votes on the most common indentation pattern.
 * Returns { useTabs: boolean, tabSize: number }.
 */

export interface DetectedIndent {
  /** Whether the file uses tabs (true) or spaces (false). */
  useTabs: boolean;
  /** The detected tab/indent size (2, 4, 8). */
  tabSize: number;
}

/**
 * Detect indentation style from file content.
 *
 * Scans up to `maxLines` lines. For each indented non-empty line,
 * checks whether it starts with tabs or spaces, and for spaces,
 * counts the indent width. Returns the majority vote.
 *
 * Defaults to { useTabs: false, tabSize: 2 } if no indented lines found.
 */
export function detectIndentation(content: string, maxLines: number = 100): DetectedIndent {
  let tabCount = 0;
  let spaceCount = 0;

  // Count occurrences of each space indent width
  let indent2 = 0;
  let indent4 = 0;
  let indent8 = 0;

  let lineStart = 0;
  let lineNum = 0;

  for (let i = 0; i <= content.length; i++) {
    if (i === content.length || content.charCodeAt(i) === 10) {
      if (lineNum >= maxLines) break;

      // Examine line [lineStart..i)
      if (i > lineStart) {
        const firstChar = content.charCodeAt(lineStart);

        if (firstChar === 9) {
          // Tab character (charCode 9)
          tabCount++;
        } else if (firstChar === 32) {
          // Space character (charCode 32)
          // Count leading spaces
          let spaces = 0;
          let j = lineStart;
          while (j < i && content.charCodeAt(j) === 32) {
            spaces++;
            j++;
          }
          // Only count if followed by non-whitespace (not blank line)
          if (j < i && content.charCodeAt(j) !== 9) {
            spaceCount++;
            if (spaces % 8 === 0) indent8++;
            if (spaces % 4 === 0) indent4++;
            if (spaces % 2 === 0) indent2++;
          }
        }
      }

      lineStart = i + 1;
      lineNum++;
    }
  }

  // No indented lines found — return defaults
  if (tabCount === 0 && spaceCount === 0) {
    return { useTabs: false, tabSize: 2 };
  }

  // Tabs win
  if (tabCount > spaceCount) {
    return { useTabs: true, tabSize: 4 };
  }

  // Spaces win — determine size
  // If all space-indented lines are divisible by 4, it's 4-space indent
  // If not all divisible by 4 but all divisible by 2, it's 2-space
  if (indent4 === spaceCount && indent4 > 0) {
    // Could be 4 or 8 — check if all are also divisible by 8
    if (indent8 === spaceCount && indent8 > 0) {
      return { useTabs: false, tabSize: 8 };
    }
    return { useTabs: false, tabSize: 4 };
  }
  if (indent2 === spaceCount && indent2 > 0) {
    return { useTabs: false, tabSize: 2 };
  }

  // Mixed — default to most common
  return { useTabs: false, tabSize: 2 };
}
