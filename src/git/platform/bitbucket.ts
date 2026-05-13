import type { PlatformClient, PlatformConfig, PullRequest, ReviewComment } from './platform-client';

export class BitbucketClient implements PlatformClient {
  readonly id = 'bitbucket';
  readonly name = 'Bitbucket';

  listPullRequests(config: PlatformConfig, state: 'open' | 'closed' | 'all' = 'open') {
    const base = config.baseUrl ?? 'https://api.bitbucket.org';
    const bbState = state === 'open' ? 'OPEN' : state === 'closed' ? 'MERGED,DECLINED' : '';
    const query = bbState ? `?state=${bbState}` : '';
    return {
      method: 'GET',
      url: `${base}/2.0/repositories/${config.owner}/${config.repo}/pullrequests${query}`,
      headers: { 'Authorization': `Bearer ${config.token}` },
    };
  }

  parsePullRequests(responseBody: string): PullRequest[] {
    const data = JSON.parse(responseBody);
    const values = data.values ?? [];
    if (!Array.isArray(values)) return [];
    return values.map((pr: any) => ({
      number: pr.id,
      title: pr.title,
      body: pr.description ?? '',
      state: pr.state === 'MERGED' ? 'merged' as const : pr.state === 'OPEN' ? 'open' as const : 'closed' as const,
      author: pr.author?.display_name ?? '',
      headBranch: pr.source?.branch?.name ?? '',
      baseBranch: pr.destination?.branch?.name ?? '',
      url: pr.links?.html?.href ?? '',
      createdAt: pr.created_on ?? '',
      updatedAt: pr.updated_on ?? '',
    }));
  }

  getPullRequest(config: PlatformConfig, number: number) {
    const base = config.baseUrl ?? 'https://api.bitbucket.org';
    return {
      method: 'GET',
      url: `${base}/2.0/repositories/${config.owner}/${config.repo}/pullrequests/${number}`,
      headers: { 'Authorization': `Bearer ${config.token}` },
    };
  }

  getPullRequestDiff(config: PlatformConfig, number: number) {
    const base = config.baseUrl ?? 'https://api.bitbucket.org';
    return {
      method: 'GET',
      url: `${base}/2.0/repositories/${config.owner}/${config.repo}/pullrequests/${number}/diff`,
      headers: { 'Authorization': `Bearer ${config.token}` },
    };
  }

  submitReview(config: PlatformConfig, prNumber: number, comments: ReviewComment[], body: string) {
    const base = config.baseUrl ?? 'https://api.bitbucket.org';
    return {
      method: 'POST',
      url: `${base}/2.0/repositories/${config.owner}/${config.repo}/pullrequests/${prNumber}/comments`,
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: { raw: body } }),
    };
  }
}
