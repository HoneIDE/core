/**
 * Abstract interface for Git hosting platform APIs.
 */
export interface PullRequest {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  author: string;
  headBranch: string;
  baseBranch: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewComment {
  path: string;
  line: number;
  body: string;
  side?: 'LEFT' | 'RIGHT';
}

export interface PlatformConfig {
  token: string;
  baseUrl?: string;
  owner: string;
  repo: string;
}

export interface PlatformClient {
  readonly id: string;
  readonly name: string;

  listPullRequests(config: PlatformConfig, state?: 'open' | 'closed' | 'all'): {
    method: string; url: string; headers: Record<string, string>;
  };

  parsePullRequests(responseBody: string): PullRequest[];

  getPullRequest(config: PlatformConfig, number: number): {
    method: string; url: string; headers: Record<string, string>;
  };

  getPullRequestDiff(config: PlatformConfig, number: number): {
    method: string; url: string; headers: Record<string, string>;
  };

  submitReview(config: PlatformConfig, prNumber: number, comments: ReviewComment[], body: string): {
    method: string; url: string; headers: Record<string, string>; body: string;
  };
}
