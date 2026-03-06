/**
 * Apply unified diffs to file content and generate reverse diffs.
 * Reuses DiffHunk/DiffLine types from git/diff.ts.
 */

import { parseUnifiedDiff, type DiffHunk, type DiffLine } from '../git/diff';

export interface ApplyResult {
  success: boolean;
  newContent: string;
  error?: string;
}

/**
 * Apply a unified diff string to file content.
 * The diff should be a single-file diff (parsed via parseUnifiedDiff).
 */
export function applyPatch(content: string, diff: string): ApplyResult {
  const parsed = parseUnifiedDiff(diff);
  if (parsed.length === 0) {
    return { success: false, newContent: '', error: 'No diff hunks found' };
  }

  // Use the first file diff (single-file patch)
  const fileDiff = parsed[0];
  return applyHunks(content, fileDiff.hunks);
}

/**
 * Apply parsed hunks to file content.
 */
export function applyHunks(content: string, hunks: DiffHunk[]): ApplyResult {
  if (hunks.length === 0) {
    return { success: true, newContent: content };
  }

  const lines = content.split('\n');
  // Process hunks in reverse order to preserve line numbers
  const sortedHunks = hunks.slice().sort((a, b) => b.oldStart - a.oldStart);

  for (let h = 0; h < sortedHunks.length; h++) {
    const hunk = sortedHunks[h];
    const result = applyOneHunk(lines, hunk);
    if (!result.success) {
      return { success: false, newContent: '', error: result.error };
    }
  }

  return { success: true, newContent: lines.join('\n') };
}

interface HunkApplyResult {
  success: boolean;
  error?: string;
}

function applyOneHunk(lines: string[], hunk: DiffHunk): HunkApplyResult {
  // oldStart is 1-based
  const startIdx = hunk.oldStart - 1;

  // Verify context and delete lines match
  const oldLines: string[] = [];
  const newLines: string[] = [];

  for (let i = 0; i < hunk.lines.length; i++) {
    const dl = hunk.lines[i];
    if (dl.type === 'context') {
      oldLines.push(dl.content);
      newLines.push(dl.content);
    } else if (dl.type === 'delete') {
      oldLines.push(dl.content);
    } else if (dl.type === 'add') {
      newLines.push(dl.content);
    }
  }

  // Verify old lines match
  for (let i = 0; i < oldLines.length; i++) {
    const lineIdx = startIdx + i;
    if (lineIdx >= lines.length) {
      return { success: false, error: `Hunk at line ${hunk.oldStart}: file too short (expected line ${lineIdx + 1})` };
    }
    if (lines[lineIdx] !== oldLines[i]) {
      return {
        success: false,
        error: `Hunk at line ${hunk.oldStart}: mismatch at line ${lineIdx + 1}: expected "${oldLines[i]}", got "${lines[lineIdx]}"`,
      };
    }
  }

  // Replace old lines with new lines
  lines.splice(startIdx, oldLines.length, ...newLines);
  return { success: true };
}

/**
 * Generate a reverse diff string from a unified diff.
 * Swaps +/- lines and inverts hunk headers.
 */
export function reverseDiff(diff: string): string {
  const lines = diff.split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('--- a/')) {
      result.push('+++ b/' + line.slice(6));
      continue;
    }
    if (line.startsWith('+++ b/')) {
      result.push('--- a/' + line.slice(6));
      continue;
    }
    if (line.startsWith('@@ ')) {
      // Swap old/new in hunk header: @@ -oldStart,oldCount +newStart,newCount @@
      const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)/);
      if (match) {
        const oldStart = match[1];
        const oldCount = match[2] !== undefined ? match[2] : '1';
        const newStart = match[3];
        const newCount = match[4] !== undefined ? match[4] : '1';
        const rest = match[5] || '';
        result.push(`@@ -${newStart},${newCount} +${oldStart},${oldCount} @@${rest}`);
      } else {
        result.push(line);
      }
      continue;
    }

    if (line.startsWith('+')) {
      result.push('-' + line.slice(1));
    } else if (line.startsWith('-')) {
      result.push('+' + line.slice(1));
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
}

/**
 * Compute a simple hash of file content (djb2).
 */
export function hashContent(content: string): string {
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash + content.charCodeAt(i)) & 0xffffffff;
  }
  return (hash >>> 0).toString(16);
}
