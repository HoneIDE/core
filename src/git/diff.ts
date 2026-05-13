/**
 * Unified diff parser — parses `git diff` output into structured hunks.
 */

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'context' | 'add' | 'delete';
  content: string;
  oldLineNum: number;   // 0 for added lines
  newLineNum: number;   // 0 for deleted lines
}

export interface FileDiff {
  oldPath: string;
  newPath: string;
  hunks: DiffHunk[];
  isBinary: boolean;
  isNew: boolean;
  isDeleted: boolean;
  isRenamed: boolean;
}

/**
 * Parse unified diff output from git diff.
 *
 * Format:
 *   diff --git a/file b/file
 *   index abc..def 100644
 *   --- a/file
 *   +++ b/file
 *   @@ -oldStart,oldCount +newStart,newCount @@
 *    context line
 *   +added line
 *   -deleted line
 */
export function parseUnifiedDiff(output: string): FileDiff[] {
  const diffs: FileDiff[] = [];
  const lines = output.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Look for "diff --git" header
    if (!line.startsWith('diff --git ')) {
      i++;
      continue;
    }

    // Parse "diff --git a/old b/new"
    const diffLine = line.slice(11); // after "diff --git "
    const mid = diffLine.indexOf(' b/');
    let oldPath = '';
    let newPath = '';
    if (mid >= 0) {
      oldPath = diffLine.slice(2, mid); // skip "a/"
      newPath = diffLine.slice(mid + 3); // skip " b/"
    }
    i++;

    let isBinary = false;
    let isNew = false;
    let isDeleted = false;
    let isRenamed = false;
    const hunks: DiffHunk[] = [];

    // Process metadata lines until we hit @@, next diff, or end
    while (i < lines.length) {
      const l = lines[i];
      if (l.startsWith('diff --git ')) break;

      if (l.startsWith('Binary files')) {
        isBinary = true;
        i++;
        break;
      }
      if (l.startsWith('new file mode')) {
        isNew = true;
        i++;
        continue;
      }
      if (l.startsWith('deleted file mode')) {
        isDeleted = true;
        i++;
        continue;
      }
      if (l.startsWith('rename from ') || l.startsWith('similarity index')) {
        isRenamed = true;
        i++;
        continue;
      }
      if (l.startsWith('rename to ')) {
        i++;
        continue;
      }
      if (l.startsWith('index ') || l.startsWith('--- ') || l.startsWith('+++ ')) {
        i++;
        continue;
      }

      if (l.startsWith('@@ ')) {
        // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
        const hunkMatch = l.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        if (!hunkMatch) { i++; continue; }

        const oldStart = parseInt(hunkMatch[1], 10);
        const oldCount = hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1;
        const newStart = parseInt(hunkMatch[3], 10);
        const newCount = hunkMatch[4] !== undefined ? parseInt(hunkMatch[4], 10) : 1;

        const hunkLines: DiffLine[] = [];
        let oldLine = oldStart;
        let newLine = newStart;
        i++;

        // Read hunk lines until next hunk, next diff, or end
        while (i < lines.length) {
          const hl = lines[i];
          if (hl.startsWith('diff --git ') || hl.startsWith('@@ ')) break;

          if (hl.startsWith('+')) {
            hunkLines.push({
              type: 'add',
              content: hl.slice(1),
              oldLineNum: 0,
              newLineNum: newLine,
            });
            newLine++;
          } else if (hl.startsWith('-')) {
            hunkLines.push({
              type: 'delete',
              content: hl.slice(1),
              oldLineNum: oldLine,
              newLineNum: 0,
            });
            oldLine++;
          } else if (hl.startsWith(' ') || hl === '') {
            hunkLines.push({
              type: 'context',
              content: hl.startsWith(' ') ? hl.slice(1) : hl,
              oldLineNum: oldLine,
              newLineNum: newLine,
            });
            oldLine++;
            newLine++;
          } else if (hl.startsWith('\\')) {
            // "\ No newline at end of file" — skip
            i++;
            continue;
          } else {
            break;
          }
          i++;
        }

        hunks.push({ oldStart, oldCount, newStart, newCount, lines: hunkLines });
        continue;
      }

      i++;
    }

    diffs.push({ oldPath, newPath, hunks, isBinary, isNew, isDeleted, isRenamed });
  }

  return diffs;
}

/** Count total additions in a diff. */
export function countAdditions(diff: FileDiff): number {
  let count = 0;
  for (const hunk of diff.hunks) {
    for (const line of hunk.lines) {
      if (line.type === 'add') count++;
    }
  }
  return count;
}

/** Count total deletions in a diff. */
export function countDeletions(diff: FileDiff): number {
  let count = 0;
  for (const hunk of diff.hunks) {
    for (const line of hunk.lines) {
      if (line.type === 'delete') count++;
    }
  }
  return count;
}
