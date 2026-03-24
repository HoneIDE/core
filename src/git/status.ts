/**
 * Git status parser — parses `git status --porcelain=v2 --branch` output.
 */

export interface GitBranchInfo {
  head: string;          // current branch name or '(detached)'
  upstream: string;      // upstream tracking branch or ''
  ahead: number;         // commits ahead of upstream
  behind: number;        // commits behind upstream
}

export type GitStatusCode =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'ignored'
  | 'unmerged';

export interface GitFileStatus {
  path: string;
  origPath: string;      // original path for renames/copies, '' otherwise
  indexStatus: GitStatusCode | '';
  workTreeStatus: GitStatusCode | '';
}

export interface GitStatus {
  branch: GitBranchInfo;
  files: GitFileStatus[];
}

/** Map a single-char status code to a GitStatusCode. */
function charToStatus(c: string): GitStatusCode | '' {
  switch (c) {
    case 'M': return 'modified';
    case 'A': return 'added';
    case 'D': return 'deleted';
    case 'R': return 'renamed';
    case 'C': return 'copied';
    case '?': return 'untracked';
    case '!': return 'ignored';
    case 'U': return 'unmerged';
    case '.': return '';
    default: return '';
  }
}

/**
 * Parse git status --porcelain=v2 --branch output.
 *
 * Format reference: https://git-scm.com/docs/git-status#_porcelain_format_version_2
 *
 * Header lines start with '#':
 *   # branch.oid <commit>
 *   # branch.head <name>
 *   # branch.upstream <upstream>
 *   # branch.ab +<ahead> -<behind>
 *
 * Changed entries start with '1' (ordinary) or '2' (rename/copy):
 *   1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
 *   2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path>\t<origPath>
 *
 * Untracked entries start with '?':
 *   ? <path>
 *
 * Ignored entries start with '!':
 *   ! <path>
 *
 * Unmerged entries start with 'u':
 *   u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
 */
/** Find the character offset right after the Nth space in a line. Returns 0 if not found. */
function findNthSpace(line: string, n: number): number {
  let count = 0;
  for (let j = 0; j < line.length; j++) {
    if (line[j] === ' ') {
      count++;
      if (count === n) return j + 1;
    }
  }
  return 0;
}

export function parseGitStatus(output: string): GitStatus {
  const branch: GitBranchInfo = {
    head: '',
    upstream: '',
    ahead: 0,
    behind: 0,
  };
  const files: GitFileStatus[] = [];

  const lines = output.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length === 0) continue;

    const first = line[0];

    if (first === '#') {
      // Branch header
      if (line.startsWith('# branch.head ')) {
        branch.head = line.slice(14);
      } else if (line.startsWith('# branch.upstream ')) {
        branch.upstream = line.slice(18);
      } else if (line.startsWith('# branch.ab ')) {
        const parts = line.slice(12).split(' ');
        if (parts.length >= 2) {
          branch.ahead = parseInt(parts[0].slice(1), 10) || 0;
          branch.behind = parseInt(parts[1].slice(1), 10) || 0;
        }
      }
    } else if (first === '1') {
      // Ordinary changed entry: 1 XY sub mH mI mW hH hI path
      const xy = line.slice(2, 4);
      // Find path — it's after the 8th space
      const pathStart = findNthSpace(line, 8);
      const path = line.slice(pathStart);
      files.push({
        path,
        origPath: '',
        indexStatus: charToStatus(xy[0]),
        workTreeStatus: charToStatus(xy[1]),
      });
    } else if (first === '2') {
      // Rename/copy entry: 2 XY sub mH mI mW hH hI Xscore path\torigPath
      const xy = line.slice(2, 4);
      // Find path after 8th space, then split on tab
      const pathStart = findNthSpace(line, 8);
      // Skip the Xscore field (e.g., "R100") — find next space
      let scoreEnd = pathStart;
      while (scoreEnd < line.length && line[scoreEnd] !== ' ') scoreEnd++;
      const rest = line.slice(scoreEnd + 1);
      const tabIdx = rest.indexOf('\t');
      if (tabIdx >= 0) {
        files.push({
          path: rest.slice(0, tabIdx),
          origPath: rest.slice(tabIdx + 1),
          indexStatus: charToStatus(xy[0]),
          workTreeStatus: charToStatus(xy[1]),
        });
      }
    } else if (first === '?') {
      // Untracked: ? path
      files.push({
        path: line.slice(2),
        origPath: '',
        indexStatus: '',
        workTreeStatus: 'untracked',
      });
    } else if (first === '!') {
      // Ignored: ! path
      files.push({
        path: line.slice(2),
        origPath: '',
        indexStatus: '',
        workTreeStatus: 'ignored',
      });
    } else if (first === 'u') {
      // Unmerged: u XY sub m1 m2 m3 mW h1 h2 h3 path
      const xy = line.slice(2, 4);
      const pathStart = findNthSpace(line, 10);
      files.push({
        path: line.slice(pathStart),
        origPath: '',
        indexStatus: charToStatus(xy[0]),
        workTreeStatus: charToStatus(xy[1]),
      });
    }
  }

  return { branch, files };
}

/** Convenience: get staged files. */
export function getStagedFiles(status: GitStatus): GitFileStatus[] {
  return status.files.filter(f => f.indexStatus !== '' && f.workTreeStatus !== 'untracked');
}

/** Convenience: get modified (unstaged) files. */
export function getModifiedFiles(status: GitStatus): GitFileStatus[] {
  return status.files.filter(f => f.workTreeStatus !== '' && f.workTreeStatus !== 'untracked' && f.workTreeStatus !== 'ignored');
}

/** Convenience: get untracked files. */
export function getUntrackedFiles(status: GitStatus): GitFileStatus[] {
  return status.files.filter(f => f.workTreeStatus === 'untracked');
}
