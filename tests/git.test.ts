/**
 * Tests for Slice 4: Git status, diff, and log parsers.
 */
import { describe, test, expect } from 'bun:test';
import {
  parseGitStatus,
  getStagedFiles,
  getModifiedFiles,
  getUntrackedFiles,
} from '../src/git/status';
import {
  parseUnifiedDiff,
  countAdditions,
  countDeletions,
} from '../src/git/diff';
import {
  parseGitLog,
  parseGitBranches,
} from '../src/git/log';
import { parseBlameOutput } from '../src/git/blame';
import { GitHubClient } from '../src/git/platform/github';
import { GitLabClient } from '../src/git/platform/gitlab';
import { BitbucketClient } from '../src/git/platform/bitbucket';
import type { PlatformConfig } from '../src/git/platform/platform-client';

// =============================================================================
// Git Status Parser
// =============================================================================

describe('parseGitStatus', () => {
  test('parses branch header', () => {
    const output = [
      '# branch.oid abc123def456',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +3 -1',
    ].join('\n');
    const result = parseGitStatus(output);
    expect(result.branch.head).toBe('main');
    expect(result.branch.upstream).toBe('origin/main');
    expect(result.branch.ahead).toBe(3);
    expect(result.branch.behind).toBe(1);
  });

  test('parses detached HEAD', () => {
    const output = '# branch.head (detached)\n';
    const result = parseGitStatus(output);
    expect(result.branch.head).toBe('(detached)');
  });

  test('parses branch with no upstream', () => {
    const output = '# branch.head feature-x\n';
    const result = parseGitStatus(output);
    expect(result.branch.head).toBe('feature-x');
    expect(result.branch.upstream).toBe('');
    expect(result.branch.ahead).toBe(0);
    expect(result.branch.behind).toBe(0);
  });

  test('parses ordinary changed entry (modified in worktree)', () => {
    const output = '1 .M N... 100644 100644 100644 abc123 def456 src/app.ts\n';
    const result = parseGitStatus(output);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('src/app.ts');
    expect(result.files[0].indexStatus).toBe('');
    expect(result.files[0].workTreeStatus).toBe('modified');
  });

  test('parses ordinary changed entry (staged add)', () => {
    const output = '1 A. N... 000000 100644 100644 000000 abc123 new-file.ts\n';
    const result = parseGitStatus(output);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].indexStatus).toBe('added');
    expect(result.files[0].workTreeStatus).toBe('');
  });

  test('parses ordinary changed entry (both staged and modified)', () => {
    const output = '1 MM N... 100644 100644 100644 abc123 def456 both.ts\n';
    const result = parseGitStatus(output);
    expect(result.files[0].indexStatus).toBe('modified');
    expect(result.files[0].workTreeStatus).toBe('modified');
  });

  test('parses staged delete', () => {
    const output = '1 D. N... 100644 000000 000000 abc123 000000 deleted.ts\n';
    const result = parseGitStatus(output);
    expect(result.files[0].indexStatus).toBe('deleted');
  });

  test('parses rename entry', () => {
    const output = '2 R. N... 100644 100644 100644 abc123 def456 R100 new-name.ts\told-name.ts\n';
    const result = parseGitStatus(output);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('new-name.ts');
    expect(result.files[0].origPath).toBe('old-name.ts');
    expect(result.files[0].indexStatus).toBe('renamed');
  });

  test('parses untracked file', () => {
    const output = '? untracked.txt\n';
    const result = parseGitStatus(output);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('untracked.txt');
    expect(result.files[0].workTreeStatus).toBe('untracked');
  });

  test('parses ignored file', () => {
    const output = '! node_modules/foo.js\n';
    const result = parseGitStatus(output);
    expect(result.files[0].workTreeStatus).toBe('ignored');
  });

  test('parses unmerged entry', () => {
    const output = 'u UU N... 100644 100644 100644 100644 abc123 def456 ghi789 conflict.ts\n';
    const result = parseGitStatus(output);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('conflict.ts');
    expect(result.files[0].indexStatus).toBe('unmerged');
    expect(result.files[0].workTreeStatus).toBe('unmerged');
  });

  test('parses multiple entries', () => {
    const output = [
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +0 -0',
      '1 .M N... 100644 100644 100644 abc123 def456 src/app.ts',
      '1 A. N... 000000 100644 100644 000000 abc123 new-file.ts',
      '? untracked.txt',
      '? another.txt',
    ].join('\n');
    const result = parseGitStatus(output);
    expect(result.branch.head).toBe('main');
    expect(result.files).toHaveLength(4);
  });

  test('handles empty output', () => {
    const result = parseGitStatus('');
    expect(result.files).toHaveLength(0);
    expect(result.branch.head).toBe('');
  });

  test('handles clean repo (only headers)', () => {
    const output = [
      '# branch.oid abc123',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +0 -0',
    ].join('\n');
    const result = parseGitStatus(output);
    expect(result.files).toHaveLength(0);
    expect(result.branch.head).toBe('main');
  });
});

// =============================================================================
// Git Status Helpers
// =============================================================================

describe('status helpers', () => {
  const output = [
    '1 A. N... 000000 100644 100644 000000 abc123 staged.ts',
    '1 .M N... 100644 100644 100644 abc123 def456 modified.ts',
    '1 MM N... 100644 100644 100644 abc123 def456 both.ts',
    '? untracked.txt',
  ].join('\n');
  const status = parseGitStatus(output);

  test('getStagedFiles returns staged entries', () => {
    const staged = getStagedFiles(status);
    expect(staged).toHaveLength(2); // staged.ts and both.ts
    expect(staged[0].path).toBe('staged.ts');
    expect(staged[1].path).toBe('both.ts');
  });

  test('getModifiedFiles returns worktree changes', () => {
    const modified = getModifiedFiles(status);
    expect(modified).toHaveLength(2); // modified.ts and both.ts
  });

  test('getUntrackedFiles returns untracked', () => {
    const untracked = getUntrackedFiles(status);
    expect(untracked).toHaveLength(1);
    expect(untracked[0].path).toBe('untracked.txt');
  });
});

// =============================================================================
// Unified Diff Parser
// =============================================================================

describe('parseUnifiedDiff', () => {
  test('parses simple addition', () => {
    const diff = [
      'diff --git a/file.ts b/file.ts',
      'index abc..def 100644',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,3 +1,4 @@',
      ' line 1',
      ' line 2',
      '+new line',
      ' line 3',
    ].join('\n');
    const result = parseUnifiedDiff(diff);
    expect(result).toHaveLength(1);
    expect(result[0].oldPath).toBe('file.ts');
    expect(result[0].newPath).toBe('file.ts');
    expect(result[0].hunks).toHaveLength(1);
    expect(result[0].hunks[0].lines).toHaveLength(4);
    expect(countAdditions(result[0])).toBe(1);
    expect(countDeletions(result[0])).toBe(0);
  });

  test('parses deletion', () => {
    const diff = [
      'diff --git a/file.ts b/file.ts',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,4 +1,3 @@',
      ' line 1',
      '-deleted line',
      ' line 2',
      ' line 3',
    ].join('\n');
    const result = parseUnifiedDiff(diff);
    expect(countDeletions(result[0])).toBe(1);
    expect(countAdditions(result[0])).toBe(0);
  });

  test('parses modification (delete + add)', () => {
    const diff = [
      'diff --git a/file.ts b/file.ts',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,3 +1,3 @@',
      ' line 1',
      '-old line',
      '+new line',
      ' line 3',
    ].join('\n');
    const result = parseUnifiedDiff(diff);
    expect(countAdditions(result[0])).toBe(1);
    expect(countDeletions(result[0])).toBe(1);
  });

  test('parses multiple hunks', () => {
    const diff = [
      'diff --git a/file.ts b/file.ts',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,3 +1,4 @@',
      ' line 1',
      '+added',
      ' line 2',
      ' line 3',
      '@@ -10,3 +11,4 @@',
      ' line 10',
      '+another added',
      ' line 11',
      ' line 12',
    ].join('\n');
    const result = parseUnifiedDiff(diff);
    expect(result[0].hunks).toHaveLength(2);
  });

  test('parses multiple files', () => {
    const diff = [
      'diff --git a/one.ts b/one.ts',
      '--- a/one.ts',
      '+++ b/one.ts',
      '@@ -1,2 +1,3 @@',
      ' a',
      '+b',
      ' c',
      'diff --git a/two.ts b/two.ts',
      '--- a/two.ts',
      '+++ b/two.ts',
      '@@ -1,2 +1,3 @@',
      ' x',
      '+y',
      ' z',
    ].join('\n');
    const result = parseUnifiedDiff(diff);
    expect(result).toHaveLength(2);
    expect(result[0].newPath).toBe('one.ts');
    expect(result[1].newPath).toBe('two.ts');
  });

  test('parses new file', () => {
    const diff = [
      'diff --git a/new.ts b/new.ts',
      'new file mode 100644',
      'index 0000000..abc1234',
      '--- /dev/null',
      '+++ b/new.ts',
      '@@ -0,0 +1,3 @@',
      '+line 1',
      '+line 2',
      '+line 3',
    ].join('\n');
    const result = parseUnifiedDiff(diff);
    expect(result[0].isNew).toBe(true);
    expect(countAdditions(result[0])).toBe(3);
  });

  test('parses deleted file', () => {
    const diff = [
      'diff --git a/old.ts b/old.ts',
      'deleted file mode 100644',
      'index abc1234..0000000',
      '--- a/old.ts',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      '-line 1',
      '-line 2',
    ].join('\n');
    const result = parseUnifiedDiff(diff);
    expect(result[0].isDeleted).toBe(true);
    expect(countDeletions(result[0])).toBe(2);
  });

  test('parses binary file', () => {
    const diff = [
      'diff --git a/image.png b/image.png',
      'Binary files a/image.png and b/image.png differ',
    ].join('\n');
    const result = parseUnifiedDiff(diff);
    expect(result[0].isBinary).toBe(true);
    expect(result[0].hunks).toHaveLength(0);
  });

  test('parses rename', () => {
    const diff = [
      'diff --git a/old.ts b/new.ts',
      'similarity index 100%',
      'rename from old.ts',
      'rename to new.ts',
    ].join('\n');
    const result = parseUnifiedDiff(diff);
    expect(result[0].isRenamed).toBe(true);
    expect(result[0].oldPath).toBe('old.ts');
    expect(result[0].newPath).toBe('new.ts');
  });

  test('tracks line numbers correctly', () => {
    const diff = [
      'diff --git a/file.ts b/file.ts',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -5,4 +5,5 @@',
      ' context',
      '-deleted',
      '+added1',
      '+added2',
      ' context2',
    ].join('\n');
    const result = parseUnifiedDiff(diff);
    const lines = result[0].hunks[0].lines;
    expect(lines[0].oldLineNum).toBe(5);
    expect(lines[0].newLineNum).toBe(5);
    expect(lines[1].type).toBe('delete');
    expect(lines[1].oldLineNum).toBe(6);
    expect(lines[1].newLineNum).toBe(0);
    expect(lines[2].type).toBe('add');
    expect(lines[2].oldLineNum).toBe(0);
    expect(lines[2].newLineNum).toBe(6);
    expect(lines[3].type).toBe('add');
    expect(lines[3].newLineNum).toBe(7);
    expect(lines[4].oldLineNum).toBe(7);
    expect(lines[4].newLineNum).toBe(8);
  });

  test('handles empty diff', () => {
    const result = parseUnifiedDiff('');
    expect(result).toHaveLength(0);
  });

  test('handles no newline at end of file marker', () => {
    const diff = [
      'diff --git a/file.ts b/file.ts',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,2 +1,2 @@',
      '-old',
      '\\ No newline at end of file',
      '+new',
      '\\ No newline at end of file',
    ].join('\n');
    const result = parseUnifiedDiff(diff);
    expect(result[0].hunks[0].lines).toHaveLength(2);
  });
});

// =============================================================================
// Git Log Parser
// =============================================================================

describe('parseGitLog', () => {
  test('parses single commit', () => {
    const output = 'abc123def456\x1fabc123d\x1fJohn Doe\x1fjohn@example.com\x1f2024-01-15T10:30:00+00:00\x1fFix bug in parser\x1fDetailed description\x1fparent123\x1e';
    const result = parseGitLog(output);
    expect(result).toHaveLength(1);
    expect(result[0].hash).toBe('abc123def456');
    expect(result[0].shortHash).toBe('abc123d');
    expect(result[0].author).toBe('John Doe');
    expect(result[0].email).toBe('john@example.com');
    expect(result[0].subject).toBe('Fix bug in parser');
    expect(result[0].body).toBe('Detailed description');
    expect(result[0].parents).toEqual(['parent123']);
  });

  test('parses multiple commits', () => {
    const output = [
      'hash1\x1fh1\x1fAlice\x1fa@a.com\x1f2024-01-15\x1fFirst\x1f\x1f\x1e',
      'hash2\x1fh2\x1fBob\x1fb@b.com\x1f2024-01-14\x1fSecond\x1f\x1fhash1\x1e',
      'hash3\x1fh3\x1fCharlie\x1fc@c.com\x1f2024-01-13\x1fThird\x1f\x1fhash2\x1e',
    ].join('');
    const result = parseGitLog(output);
    expect(result).toHaveLength(3);
    expect(result[0].author).toBe('Alice');
    expect(result[1].author).toBe('Bob');
    expect(result[2].author).toBe('Charlie');
  });

  test('parses merge commit with multiple parents', () => {
    const output = 'hash1\x1fh1\x1fAlice\x1fa@a.com\x1f2024-01-15\x1fMerge branch\x1f\x1fparent1 parent2\x1e';
    const result = parseGitLog(output);
    expect(result[0].parents).toEqual(['parent1', 'parent2']);
  });

  test('parses commit with no parents (initial commit)', () => {
    const output = 'hash1\x1fh1\x1fAlice\x1fa@a.com\x1f2024-01-15\x1fInitial\x1f\x1f\x1e';
    const result = parseGitLog(output);
    expect(result[0].parents).toEqual([]);
  });

  test('handles empty output', () => {
    const result = parseGitLog('');
    expect(result).toHaveLength(0);
  });

  test('handles commit with empty body', () => {
    const output = 'hash1\x1fh1\x1fAlice\x1fa@a.com\x1f2024-01-15\x1fSubject\x1f\x1fparent1\x1e';
    const result = parseGitLog(output);
    expect(result[0].body).toBe('');
  });
});

// =============================================================================
// Git Branch Parser
// =============================================================================

describe('parseGitBranches', () => {
  test('parses branch list with current branch', () => {
    const output = '  feature-a\n* main\n  feature-b\n';
    const result = parseGitBranches(output);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ name: 'feature-a', current: false });
    expect(result[1]).toEqual({ name: 'main', current: true });
    expect(result[2]).toEqual({ name: 'feature-b', current: false });
  });

  test('parses single branch', () => {
    const output = '* main\n';
    const result = parseGitBranches(output);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('main');
    expect(result[0].current).toBe(true);
  });

  test('handles empty output', () => {
    const result = parseGitBranches('');
    expect(result).toHaveLength(0);
  });

  test('handles multiple branches', () => {
    const output = '  dev\n  feature/login\n* main\n  release/1.0\n';
    const result = parseGitBranches(output);
    expect(result).toHaveLength(4);
    const current = result.find(b => b.current);
    expect(current?.name).toBe('main');
  });
});

// =============================================================================
// Git Blame Parser
// =============================================================================

describe('parseBlameOutput', () => {
  test('parses single entry', () => {
    const raw = [
      'abcdef1234567890abcdef1234567890abcdef12 1 1 1',
      'author John Doe',
      'author-mail <john@example.com>',
      'author-time 1700000000',
      'author-tz +0000',
      'committer Jane Smith',
      'committer-mail <jane@example.com>',
      'committer-time 1700000100',
      'committer-tz -0500',
      'summary Initial commit',
      'filename src/app.ts',
      '\tconst x = 1;',
    ].join('\n');
    const result = parseBlameOutput(raw);
    expect(result).toHaveLength(1);
    expect(result[0].commit).toBe('abcdef1234567890abcdef1234567890abcdef12');
    expect(result[0].lineNumber).toBe(1);
    expect(result[0].originalLine).toBe(1);
    expect(result[0].numLines).toBe(1);
    expect(result[0].content).toBe('const x = 1;');
  });

  test('parses multiple entries', () => {
    const raw = [
      'abcdef1234567890abcdef1234567890abcdef12 1 1 2',
      'author Alice',
      'author-mail <alice@test.com>',
      'author-time 1700000000',
      'author-tz +0000',
      'committer Alice',
      'committer-mail <alice@test.com>',
      'committer-time 1700000000',
      'committer-tz +0000',
      'summary Add file',
      'filename test.ts',
      '\tline one',
      'abcdef1234567890abcdef1234567890abcdef12 2 2',
      '\tline two',
      'fedcba1234567890fedcba1234567890fedcba12 3 3 1',
      'author Bob',
      'author-mail <bob@test.com>',
      'author-time 1700001000',
      'author-tz +0100',
      'committer Bob',
      'committer-mail <bob@test.com>',
      'committer-time 1700001000',
      'committer-tz +0100',
      'summary Fix bug',
      'filename test.ts',
      '\tline three',
    ].join('\n');
    const result = parseBlameOutput(raw);
    expect(result).toHaveLength(3);
    expect(result[0].author).toBe('Alice');
    expect(result[1].content).toBe('line two');
    expect(result[2].author).toBe('Bob');
    expect(result[2].summary).toBe('Fix bug');
  });

  test('handles empty input', () => {
    const result = parseBlameOutput('');
    expect(result).toHaveLength(0);
  });

  test('parses uncommitted changes (all zeros hash)', () => {
    const raw = [
      '0000000000000000000000000000000000000000 1 1 1',
      'author Not Committed Yet',
      'author-mail <not.committed.yet>',
      'author-time 1700000000',
      'author-tz +0000',
      'committer Not Committed Yet',
      'committer-mail <not.committed.yet>',
      'committer-time 1700000000',
      'committer-tz +0000',
      'summary Not Yet Committed',
      'filename draft.ts',
      '\tuncommitted line',
    ].join('\n');
    const result = parseBlameOutput(raw);
    expect(result).toHaveLength(1);
    expect(result[0].commit).toBe('0000000000000000000000000000000000000000');
    expect(result[0].author).toBe('Not Committed Yet');
    expect(result[0].content).toBe('uncommitted line');
  });

  test('handles special chars in summary', () => {
    const raw = [
      'abcdef1234567890abcdef1234567890abcdef12 1 1 1',
      'author Dev',
      'author-mail <dev@test.com>',
      'author-time 1700000000',
      'author-tz +0000',
      'committer Dev',
      'committer-mail <dev@test.com>',
      'committer-time 1700000000',
      'committer-tz +0000',
      'summary fix: handle "quotes" & <angle> brackets',
      'filename file.ts',
      '\tcode here',
    ].join('\n');
    const result = parseBlameOutput(raw);
    expect(result[0].summary).toBe('fix: handle "quotes" & <angle> brackets');
  });

  test('handles multiline content (multiple entries from same commit)', () => {
    const raw = [
      'abcdef1234567890abcdef1234567890abcdef12 1 1 3',
      'author Alice',
      'author-mail <alice@test.com>',
      'author-time 1700000000',
      'author-tz +0000',
      'committer Alice',
      'committer-mail <alice@test.com>',
      'committer-time 1700000000',
      'committer-tz +0000',
      'summary Init',
      'filename multi.ts',
      '\tfunction foo() {',
      'abcdef1234567890abcdef1234567890abcdef12 2 2',
      '\t  return 42;',
      'abcdef1234567890abcdef1234567890abcdef12 3 3',
      '\t}',
    ].join('\n');
    const result = parseBlameOutput(raw);
    expect(result).toHaveLength(3);
    expect(result[0].content).toBe('function foo() {');
    expect(result[0].numLines).toBe(3);
    expect(result[1].content).toBe('  return 42;');
    expect(result[2].content).toBe('}');
  });

  test('handles missing optional fields gracefully', () => {
    const raw = [
      'abcdef1234567890abcdef1234567890abcdef12 5 10 1',
      '\tbare content only',
    ].join('\n');
    const result = parseBlameOutput(raw);
    expect(result).toHaveLength(1);
    expect(result[0].author).toBe('');
    expect(result[0].authorMail).toBe('');
    expect(result[0].summary).toBe('');
    expect(result[0].filename).toBe('');
    expect(result[0].content).toBe('bare content only');
    expect(result[0].originalLine).toBe(5);
    expect(result[0].lineNumber).toBe(10);
  });

  test('extracts author and committer correctly', () => {
    const raw = [
      'abcdef1234567890abcdef1234567890abcdef12 1 1 1',
      'author John Author',
      'author-mail <john.author@test.com>',
      'author-time 1700000000',
      'author-tz +0530',
      'committer Jane Committer',
      'committer-mail <jane.committer@test.com>',
      'committer-time 1700005000',
      'committer-tz -0800',
      'summary Test commit',
      'filename file.ts',
      '\ttest line',
    ].join('\n');
    const result = parseBlameOutput(raw);
    expect(result[0].author).toBe('John Author');
    expect(result[0].authorMail).toBe('<john.author@test.com>');
    expect(result[0].committer).toBe('Jane Committer');
    expect(result[0].committerMail).toBe('<jane.committer@test.com>');
  });

  test('parses timestamps correctly', () => {
    const raw = [
      'abcdef1234567890abcdef1234567890abcdef12 1 1 1',
      'author Dev',
      'author-mail <dev@test.com>',
      'author-time 1609459200',
      'author-tz +0000',
      'committer Dev',
      'committer-mail <dev@test.com>',
      'committer-time 1609459300',
      'committer-tz +0000',
      'summary Timestamp test',
      'filename ts.ts',
      '\ttime check',
    ].join('\n');
    const result = parseBlameOutput(raw);
    expect(result[0].authorTime).toBe(1609459200);
    expect(result[0].committerTime).toBe(1609459300);
    expect(result[0].authorTz).toBe('+0000');
    expect(result[0].committerTz).toBe('+0000');
  });

  test('extracts filename correctly', () => {
    const raw = [
      'abcdef1234567890abcdef1234567890abcdef12 1 1 1',
      'author Dev',
      'author-mail <dev@test.com>',
      'author-time 1700000000',
      'author-tz +0000',
      'committer Dev',
      'committer-mail <dev@test.com>',
      'committer-time 1700000000',
      'committer-tz +0000',
      'summary Filename test',
      'filename src/deep/nested/path/file.ts',
      '\tdeep content',
    ].join('\n');
    const result = parseBlameOutput(raw);
    expect(result[0].filename).toBe('src/deep/nested/path/file.ts');
  });
});

// =============================================================================
// Git Platform Clients
// =============================================================================

describe('GitHubClient', () => {
  const github = new GitHubClient();
  const config: PlatformConfig = {
    token: 'ghp_test123',
    owner: 'myorg',
    repo: 'myrepo',
  };

  test('listPullRequests constructs correct URL', () => {
    const req = github.listPullRequests(config);
    expect(req.method).toBe('GET');
    expect(req.url).toBe('https://api.github.com/repos/myorg/myrepo/pulls?state=open');
  });

  test('parsePullRequests parses GitHub response', () => {
    const body = JSON.stringify([
      {
        number: 42,
        title: 'Fix bug',
        body: 'Fixes #123',
        state: 'open',
        merged_at: null,
        user: { login: 'alice' },
        head: { ref: 'fix-bug' },
        base: { ref: 'main' },
        html_url: 'https://github.com/myorg/myrepo/pull/42',
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-16T12:00:00Z',
      },
    ]);
    const prs = github.parsePullRequests(body);
    expect(prs).toHaveLength(1);
    expect(prs[0].number).toBe(42);
    expect(prs[0].title).toBe('Fix bug');
    expect(prs[0].state).toBe('open');
    expect(prs[0].author).toBe('alice');
    expect(prs[0].headBranch).toBe('fix-bug');
    expect(prs[0].baseBranch).toBe('main');
  });

  test('getPullRequestDiff uses diff accept header', () => {
    const req = github.getPullRequestDiff(config, 42);
    expect(req.headers['Accept']).toBe('application/vnd.github.v3.diff');
    expect(req.url).toContain('/pulls/42');
  });

  test('submitReview constructs correct body', () => {
    const req = github.submitReview(config, 10, [
      { path: 'src/app.ts', line: 5, body: 'Nit: use const' },
    ], 'Looks good overall');
    const parsed = JSON.parse(req.body);
    expect(parsed.body).toBe('Looks good overall');
    expect(parsed.event).toBe('COMMENT');
    expect(parsed.comments).toHaveLength(1);
    expect(parsed.comments[0].path).toBe('src/app.ts');
    expect(parsed.comments[0].side).toBe('RIGHT');
  });

  test('supports custom baseUrl', () => {
    const ghes: PlatformConfig = { ...config, baseUrl: 'https://github.example.com/api/v3' };
    const req = github.listPullRequests(ghes);
    expect(req.url).toStartWith('https://github.example.com/api/v3/repos/');
  });

  test('auth header uses Bearer format', () => {
    const req = github.listPullRequests(config);
    expect(req.headers['Authorization']).toBe('Bearer ghp_test123');
  });
});

describe('GitLabClient', () => {
  const gitlab = new GitLabClient();
  const config: PlatformConfig = {
    token: 'glpat-test456',
    owner: 'mygroup',
    repo: 'myproject',
  };

  test('listPullRequests URL encodes project path', () => {
    const req = gitlab.listPullRequests(config);
    expect(req.url).toContain(encodeURIComponent('mygroup/myproject'));
    expect(req.url).toContain('/merge_requests?state=opened');
  });

  test('parsePullRequests parses GitLab merge requests', () => {
    const body = JSON.stringify([
      {
        iid: 7,
        title: 'Add feature',
        description: 'New feature MR',
        state: 'merged',
        author: { username: 'bob' },
        source_branch: 'feature-x',
        target_branch: 'main',
        web_url: 'https://gitlab.com/mygroup/myproject/-/merge_requests/7',
        created_at: '2024-02-01T08:00:00Z',
        updated_at: '2024-02-02T09:00:00Z',
      },
    ]);
    const prs = gitlab.parsePullRequests(body);
    expect(prs).toHaveLength(1);
    expect(prs[0].number).toBe(7);
    expect(prs[0].state).toBe('merged');
    expect(prs[0].author).toBe('bob');
  });

  test('maps open state to opened for GitLab API', () => {
    const req = gitlab.listPullRequests(config, 'open');
    expect(req.url).toContain('state=opened');
  });

  test('uses PRIVATE-TOKEN header', () => {
    const req = gitlab.listPullRequests(config);
    expect(req.headers['PRIVATE-TOKEN']).toBe('glpat-test456');
  });
});

describe('BitbucketClient', () => {
  const bb = new BitbucketClient();
  const config: PlatformConfig = {
    token: 'bb_test789',
    owner: 'team',
    repo: 'project',
  };

  test('listPullRequests constructs correct URL', () => {
    const req = bb.listPullRequests(config);
    expect(req.url).toBe('https://api.bitbucket.org/2.0/repositories/team/project/pullrequests?state=OPEN');
  });

  test('parsePullRequests extracts from nested .values', () => {
    const body = JSON.stringify({
      values: [
        {
          id: 3,
          title: 'Update readme',
          description: 'Improved docs',
          state: 'OPEN',
          author: { display_name: 'Charlie' },
          source: { branch: { name: 'docs' } },
          destination: { branch: { name: 'main' } },
          links: { html: { href: 'https://bitbucket.org/team/project/pull-requests/3' } },
          created_on: '2024-03-01T10:00:00Z',
          updated_on: '2024-03-02T11:00:00Z',
        },
      ],
    });
    const prs = bb.parsePullRequests(body);
    expect(prs).toHaveLength(1);
    expect(prs[0].number).toBe(3);
    expect(prs[0].state).toBe('open');
    expect(prs[0].author).toBe('Charlie');
    expect(prs[0].headBranch).toBe('docs');
  });

  test('maps closed state to MERGED,DECLINED', () => {
    const req = bb.listPullRequests(config, 'closed');
    expect(req.url).toContain('state=MERGED,DECLINED');
  });
});

describe('Platform client IDs', () => {
  test('each platform has unique id and name', () => {
    const github = new GitHubClient();
    const gitlab = new GitLabClient();
    const bb = new BitbucketClient();
    expect(github.id).toBe('github');
    expect(github.name).toBe('GitHub');
    expect(gitlab.id).toBe('gitlab');
    expect(gitlab.name).toBe('GitLab');
    expect(bb.id).toBe('bitbucket');
    expect(bb.name).toBe('Bitbucket');
  });
});

describe('Platform empty responses', () => {
  test('GitHub parsePullRequests handles empty array', () => {
    const github = new GitHubClient();
    const prs = github.parsePullRequests('[]');
    expect(prs).toHaveLength(0);
  });

  test('GitLab parsePullRequests handles empty array', () => {
    const gitlab = new GitLabClient();
    const prs = gitlab.parsePullRequests('[]');
    expect(prs).toHaveLength(0);
  });

  test('Bitbucket parsePullRequests handles empty values', () => {
    const bb = new BitbucketClient();
    const prs = bb.parsePullRequests('{"values": []}');
    expect(prs).toHaveLength(0);
  });
});
