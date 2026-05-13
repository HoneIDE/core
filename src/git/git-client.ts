/**
 * Git client — executes git commands via execFileSync (argv array, never a shell).
 *
 * This module is for the bun/node runtime (hone-core).
 * The Perry IDE has its own simplified git integration using spawnSync in git-panel.ts.
 */
import { execFileSync } from 'child_process';
import { parseGitStatus, type GitStatus } from './status';
import { parseUnifiedDiff, type FileDiff } from './diff';
import { parseGitLog, parseGitBranches, GIT_LOG_FORMAT, type GitCommit } from './log';
import { parseBlameOutput, type BlameEntry } from './blame';

export class GitClient {
  private cwd: string;

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  /** Execute a git command with an argv array — no shell invocation. Throws on error. */
  private exec(args: string[]): string {
    const result = execFileSync('git', args, {
      cwd: this.cwd,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return typeof result === 'string' ? result : (result as Buffer).toString('utf-8');
  }

  /** Check if cwd is inside a git repository. */
  isRepo(): boolean {
    try {
      this.exec(['rev-parse', '--is-inside-work-tree']);
      return true;
    } catch {
      return false;
    }
  }

  /** Get the repo root directory. */
  repoRoot(): string {
    return this.exec(['rev-parse', '--show-toplevel']).trim();
  }

  /** Get current branch name. */
  currentBranch(): string {
    try {
      return this.exec(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
    } catch {
      return '';
    }
  }

  /** Get full git status. */
  status(): GitStatus {
    const output = this.exec(['status', '--porcelain=v2', '--branch']);
    return parseGitStatus(output);
  }

  /** Get diff of unstaged changes. */
  diff(): FileDiff[] {
    const output = this.exec(['diff']);
    return parseUnifiedDiff(output);
  }

  /** Get diff of staged changes. */
  diffStaged(): FileDiff[] {
    const output = this.exec(['diff', '--staged']);
    return parseUnifiedDiff(output);
  }

  /** Get diff between two refs. */
  diffRefs(from: string, to: string): FileDiff[] {
    const output = this.exec(['diff', `${from}..${to}`]);
    return parseUnifiedDiff(output);
  }

  /** Get commit log (most recent first). */
  log(count: number = 50): GitCommit[] {
    const n = Math.max(1, Math.floor(count));
    const output = this.exec(['log', `-${n}`, `--pretty=format:${GIT_LOG_FORMAT}`]);
    return parseGitLog(output);
  }

  /** Get local branch list. */
  branches(): { name: string; current: boolean }[] {
    const output = this.exec(['branch']);
    return parseGitBranches(output);
  }

  /** Stage a file. */
  stageFile(path: string): void {
    this.exec(['add', '--', path]);
  }

  /** Unstage a file. */
  unstageFile(path: string): void {
    this.exec(['restore', '--staged', '--', path]);
  }

  /** Discard changes to a file. */
  discardFile(path: string): void {
    this.exec(['checkout', '--', path]);
  }

  /** Commit staged changes. */
  commit(message: string): string {
    const output = this.exec(['commit', '-m', message]);
    return output.trim();
  }

  /** Switch to a branch. */
  checkout(branch: string): void {
    this.exec(['checkout', branch]);
  }

  /** Create a new branch and switch to it. */
  createBranch(name: string): void {
    this.exec(['checkout', '-b', name]);
  }

  /** Get blame information for a file. */
  blame(filePath: string): BlameEntry[] {
    const output = this.exec(['blame', '--porcelain', '--', filePath]);
    return parseBlameOutput(output);
  }
}
