import type { PlatformClient, PlatformConfig, PullRequest, ReviewComment } from './platform-client';

export class GitLabClient implements PlatformClient {
  readonly id = 'gitlab';
  readonly name = 'GitLab';

  private projectPath(config: PlatformConfig): string {
    return encodeURIComponent(`${config.owner}/${config.repo}`);
  }

  listPullRequests(config: PlatformConfig, state: 'open' | 'closed' | 'all' = 'open') {
    const base = config.baseUrl ?? 'https://gitlab.com';
    const glState = state === 'open' ? 'opened' : state === 'closed' ? 'closed' : 'all';
    return {
      method: 'GET',
      url: `${base}/api/v4/projects/${this.projectPath(config)}/merge_requests?state=${glState}`,
      headers: { 'PRIVATE-TOKEN': config.token },
    };
  }

  parsePullRequests(responseBody: string): PullRequest[] {
    const data = JSON.parse(responseBody);
    if (!Array.isArray(data)) return [];
    return data.map((mr: any) => ({
      number: mr.iid,
      title: mr.title,
      body: mr.description ?? '',
      state: mr.state === 'merged' ? 'merged' as const : mr.state === 'closed' ? 'closed' as const : 'open' as const,
      author: mr.author?.username ?? '',
      headBranch: mr.source_branch ?? '',
      baseBranch: mr.target_branch ?? '',
      url: mr.web_url ?? '',
      createdAt: mr.created_at ?? '',
      updatedAt: mr.updated_at ?? '',
    }));
  }

  getPullRequest(config: PlatformConfig, number: number) {
    const base = config.baseUrl ?? 'https://gitlab.com';
    return {
      method: 'GET',
      url: `${base}/api/v4/projects/${this.projectPath(config)}/merge_requests/${number}`,
      headers: { 'PRIVATE-TOKEN': config.token },
    };
  }

  getPullRequestDiff(config: PlatformConfig, number: number) {
    const base = config.baseUrl ?? 'https://gitlab.com';
    return {
      method: 'GET',
      url: `${base}/api/v4/projects/${this.projectPath(config)}/merge_requests/${number}/changes`,
      headers: { 'PRIVATE-TOKEN': config.token },
    };
  }

  submitReview(config: PlatformConfig, prNumber: number, comments: ReviewComment[], body: string) {
    const base = config.baseUrl ?? 'https://gitlab.com';
    // GitLab uses discussions for review comments
    return {
      method: 'POST',
      url: `${base}/api/v4/projects/${this.projectPath(config)}/merge_requests/${prNumber}/notes`,
      headers: {
        'PRIVATE-TOKEN': config.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body }),
    };
  }
}
