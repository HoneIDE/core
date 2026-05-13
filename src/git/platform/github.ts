import type { PlatformClient, PlatformConfig, PullRequest, ReviewComment } from './platform-client';

export class GitHubClient implements PlatformClient {
  readonly id = 'github';
  readonly name = 'GitHub';

  listPullRequests(config: PlatformConfig, state: 'open' | 'closed' | 'all' = 'open') {
    const base = config.baseUrl ?? 'https://api.github.com';
    return {
      method: 'GET',
      url: `${base}/repos/${config.owner}/${config.repo}/pulls?state=${state}`,
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    };
  }

  parsePullRequests(responseBody: string): PullRequest[] {
    const data = JSON.parse(responseBody);
    if (!Array.isArray(data)) return [];
    return data.map((pr: any) => ({
      number: pr.number,
      title: pr.title,
      body: pr.body ?? '',
      state: pr.merged_at ? 'merged' as const : pr.state === 'closed' ? 'closed' as const : 'open' as const,
      author: pr.user?.login ?? '',
      headBranch: pr.head?.ref ?? '',
      baseBranch: pr.base?.ref ?? '',
      url: pr.html_url ?? '',
      createdAt: pr.created_at ?? '',
      updatedAt: pr.updated_at ?? '',
    }));
  }

  getPullRequest(config: PlatformConfig, number: number) {
    const base = config.baseUrl ?? 'https://api.github.com';
    return {
      method: 'GET',
      url: `${base}/repos/${config.owner}/${config.repo}/pulls/${number}`,
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    };
  }

  getPullRequestDiff(config: PlatformConfig, number: number) {
    const base = config.baseUrl ?? 'https://api.github.com';
    return {
      method: 'GET',
      url: `${base}/repos/${config.owner}/${config.repo}/pulls/${number}`,
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Accept': 'application/vnd.github.v3.diff',
      },
    };
  }

  submitReview(config: PlatformConfig, prNumber: number, comments: ReviewComment[], body: string) {
    const base = config.baseUrl ?? 'https://api.github.com';
    return {
      method: 'POST',
      url: `${base}/repos/${config.owner}/${config.repo}/pulls/${prNumber}/reviews`,
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        body,
        event: 'COMMENT',
        comments: comments.map(c => ({
          path: c.path,
          line: c.line,
          body: c.body,
          side: c.side ?? 'RIGHT',
        })),
      }),
    };
  }
}
