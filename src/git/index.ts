export { parseGitStatus, getStagedFiles, getModifiedFiles, getUntrackedFiles } from './status';
export type { GitBranchInfo, GitStatusCode, GitFileStatus, GitStatus } from './status';

export { parseUnifiedDiff, countAdditions, countDeletions } from './diff';
export type { DiffHunk, DiffLine, FileDiff } from './diff';

export { parseGitLog, parseGitBranches, GIT_LOG_FORMAT } from './log';
export type { GitCommit } from './log';

export { GitClient } from './git-client';

export { parseBlameOutput } from './blame';
export type { BlameEntry } from './blame';

export type { PlatformClient, PlatformConfig, PullRequest, ReviewComment } from './platform/index';
export { GitHubClient } from './platform/index';
export { GitLabClient } from './platform/index';
export { BitbucketClient } from './platform/index';
