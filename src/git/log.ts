/**
 * Git log parser — parses structured git log output.
 */

export interface GitCommit {
  hash: string;          // full SHA
  shortHash: string;     // first 7 chars
  author: string;
  email: string;
  date: string;          // ISO date string
  subject: string;       // first line of commit message
  body: string;          // rest of commit message
  parents: string[];     // parent commit hashes
}

/**
 * The format string to pass to git log.
 * Uses record separator (0x1e) and unit separator (0x1f) to delimit fields.
 */
export const GIT_LOG_FORMAT = '%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%b%x1f%P%x1e';

/**
 * Parse git log output produced with GIT_LOG_FORMAT.
 */
export function parseGitLog(output: string): GitCommit[] {
  const commits: GitCommit[] = [];
  const records = output.split('\x1e');

  for (let i = 0; i < records.length; i++) {
    const record = records[i].trim();
    if (record.length === 0) continue;

    const fields = record.split('\x1f');
    if (fields.length < 6) continue;

    commits.push({
      hash: fields[0],
      shortHash: fields[1],
      author: fields[2],
      email: fields[3],
      date: fields[4],
      subject: fields[5],
      body: fields.length > 6 ? fields[6].trim() : '',
      parents: fields.length > 7 && fields[7].length > 0
        ? fields[7].trim().split(' ')
        : [],
    });
  }

  return commits;
}

/**
 * Parse simple branch list from `git branch` output.
 * Lines starting with '* ' are the current branch.
 */
export function parseGitBranches(output: string): { name: string; current: boolean }[] {
  const branches: { name: string; current: boolean }[] = [];
  const lines = output.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.startsWith('* ')) {
      branches.push({ name: trimmed.slice(2), current: true });
    } else {
      branches.push({ name: trimmed, current: false });
    }
  }
  return branches;
}
