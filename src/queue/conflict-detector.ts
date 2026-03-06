/**
 * Conflict detection for change proposals.
 * Compares base hashes and checks for overlapping edit regions.
 */

import { parseUnifiedDiff, type DiffHunk } from '../git/diff';
import { hashContent } from './diff-applier';

export type ConflictResult =
  | { state: 'none' }
  | { state: 'resolved'; updatedDiff: string }
  | { state: 'unresolved'; reason: string };

/**
 * Detect conflicts between a proposed change and the current file state.
 *
 * @param currentContent - Current file content
 * @param currentHash - Hash of current content (or null if file doesn't exist)
 * @param baseHash - Hash of content when the change was made
 * @param diff - The proposed unified diff
 */
export function detectConflict(
  currentContent: string | null,
  currentHash: string | null,
  baseHash: string | undefined,
  diff: string,
): ConflictResult {
  // If no base hash provided, can't detect conflicts — assume clean
  if (baseHash === undefined) {
    return { state: 'none' };
  }

  // If file doesn't exist yet and diff creates it, no conflict
  if (currentContent === null && currentHash === null) {
    return { state: 'none' };
  }

  // If hashes match, no conflict
  if (currentHash === baseHash) {
    return { state: 'none' };
  }

  // Hashes differ — file has been modified since the base
  // Check if changes are in non-overlapping regions
  const parsed = parseUnifiedDiff(diff);
  if (parsed.length === 0) {
    return { state: 'none' };
  }

  const proposedHunks = parsed[0].hunks;
  if (proposedHunks.length === 0) {
    return { state: 'none' };
  }

  // Get the line ranges touched by the proposed diff
  const proposedRanges = getHunkRanges(proposedHunks);

  // Since we don't have the intermediate diff (between base and current),
  // we try to apply the patch and see if it succeeds.
  // If it does, the regions don't overlap and we mark as resolved.
  if (currentContent !== null) {
    const canApply = tryApplyHunks(currentContent, proposedHunks);
    if (canApply) {
      return { state: 'resolved', updatedDiff: diff };
    }
  }

  return {
    state: 'unresolved',
    reason: `File has been modified (hash mismatch) and changes overlap at lines ${formatRanges(proposedRanges)}`,
  };
}

interface LineRange {
  start: number;
  end: number;
}

function getHunkRanges(hunks: DiffHunk[]): LineRange[] {
  const ranges: LineRange[] = [];
  for (let i = 0; i < hunks.length; i++) {
    ranges.push({
      start: hunks[i].oldStart,
      end: hunks[i].oldStart + hunks[i].oldCount - 1,
    });
  }
  return ranges;
}

function formatRanges(ranges: LineRange[]): string {
  const parts: string[] = [];
  for (let i = 0; i < ranges.length; i++) {
    if (ranges[i].start === ranges[i].end) {
      parts.push(String(ranges[i].start));
    } else {
      parts.push(`${ranges[i].start}-${ranges[i].end}`);
    }
  }
  return parts.join(', ');
}

function tryApplyHunks(content: string, hunks: DiffHunk[]): boolean {
  const lines = content.split('\n');
  const sortedHunks = hunks.slice().sort((a, b) => b.oldStart - a.oldStart);

  for (let h = 0; h < sortedHunks.length; h++) {
    const hunk = sortedHunks[h];
    const startIdx = hunk.oldStart - 1;

    const oldLines: string[] = [];
    for (let i = 0; i < hunk.lines.length; i++) {
      if (hunk.lines[i].type === 'context' || hunk.lines[i].type === 'delete') {
        oldLines.push(hunk.lines[i].content);
      }
    }

    for (let i = 0; i < oldLines.length; i++) {
      const lineIdx = startIdx + i;
      if (lineIdx >= lines.length || lines[lineIdx] !== oldLines[i]) {
        return false;
      }
    }
  }
  return true;
}
