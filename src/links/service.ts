/**
 * PR-Issue linking service using GitHub REST API
 * Provides functionality to link PRs to issues and find existing links
 */

import { GitHubClient, GitHubClientError } from '../github/client.js';
import {
  findMatches,
  findBestMatch,
  getSuggestions,
} from '../updates/matcher.js';
import type { ProjectItem } from '../github/types.js';
import type {
  LinkPRToIssueInput,
  FindLinkedPRsInput,
  SuggestPRLinksInput,
  GitHubTimelineEvent,
  PRLink,
  LinkPRResult,
  PRLinkSuggestion,
  LinkServiceOptions,
  LinkRequest,
} from './types.js';
import { PRNotFoundError, IssueNotFoundError } from './types.js';

const GITHUB_REST_ENDPOINT = 'https://api.github.com';
const DEFAULT_MIN_SUGGESTION_CONFIDENCE = 0.5;

/**
 * Link service for managing PR-issue relationships
 */
export class LinkService {
  private token: string;
  private githubClient: GitHubClient;
  private minSuggestionConfidence: number;

  constructor(options: LinkServiceOptions) {
    this.token = options.token;
    this.githubClient = new GitHubClient({ token: options.token });
    this.minSuggestionConfidence = options.minSuggestionConfidence ?? DEFAULT_MIN_SUGGESTION_CONFIDENCE;
  }

  /**
   * Link a PR to an issue by adding a comment with the PR reference
   * This creates a manual link that shows up in the issue timeline
   */
  async linkPRToIssue(input: LinkPRToIssueInput): Promise<LinkPRResult> {
    const { owner, repo, issueNumber, prNumber, message } = input;

    // Verify the PR exists
    const pr = await this.getPR(owner, repo, prNumber);
    if (!pr) {
      throw new PRNotFoundError(prNumber, owner, repo);
    }

    // Create a comment on the issue linking to the PR
    const commentBody = message
      ? `${message}\n\nLinked to PR #${prNumber}`
      : `Linked to PR #${prNumber}`;

    const response = await fetch(
      `${GITHUB_REST_ENDPOINT}/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ body: commentBody }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      if (response.status === 401) {
        throw new GitHubClientError('Authentication failed. Check your GitHub token.', 401);
      }
      if (response.status === 403) {
        throw new GitHubClientError(
          'Access denied. Ensure your token has repo scope.',
          403
        );
      }
      if (response.status === 404) {
        throw new GitHubClientError(
          `Issue #${issueNumber} not found in ${owner}/${repo}.`,
          404
        );
      }
      throw new GitHubClientError(
        `Failed to link PR: ${response.statusText} - ${errorBody}`,
        response.status
      );
    }

    const commentResponse = (await response.json()) as { html_url: string };

    return {
      success: true,
      issueNumber,
      prNumber,
      message: `Successfully linked PR #${prNumber} to issue #${issueNumber}`,
      commentUrl: commentResponse.html_url,
    };
  }

  /**
   * Find all PRs linked to an issue using the timeline API
   */
  async findLinkedPRs(input: FindLinkedPRsInput): Promise<PRLink[]> {
    const { owner, repo, issueNumber } = input;

    const response = await fetch(
      `${GITHUB_REST_ENDPOINT}/repos/${owner}/${repo}/issues/${issueNumber}/timeline?per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github.mockingbird-preview+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      if (response.status === 401) {
        throw new GitHubClientError('Authentication failed. Check your GitHub token.', 401);
      }
      if (response.status === 404) {
        throw new GitHubClientError(
          `Issue #${issueNumber} not found in ${owner}/${repo}.`,
          404
        );
      }
      throw new GitHubClientError(
        `Failed to get timeline: ${response.statusText} - ${errorBody}`,
        response.status
      );
    }

    const events = (await response.json()) as GitHubTimelineEvent[];
    const prLinks: PRLink[] = [];
    const seenPRs = new Set<number>();

    for (const event of events) {
      // Look for cross-referenced events that are PRs
      if (event.event === 'cross-referenced' && event.source?.issue?.pull_request) {
        const pr = event.source.issue;
        if (!seenPRs.has(pr.number)) {
          seenPRs.add(pr.number);

          const prState = pr.pull_request?.merged_at
            ? 'merged'
            : (await this.getPRState(owner, repo, pr.number));

          prLinks.push({
            prNumber: pr.number,
            prTitle: pr.title,
            prUrl: pr.html_url,
            prState,
            linkedAt: event.created_at,
            linkedBy: event.actor?.login ?? null,
            linkType: 'referenced',
          });
        }
      }
    }

    // Also check for closing keyword references in open PRs
    const closingPRs = await this.findClosingPRs(owner, repo, issueNumber);
    for (const pr of closingPRs) {
      if (!seenPRs.has(pr.prNumber)) {
        seenPRs.add(pr.prNumber);
        prLinks.push(pr);
      }
    }

    return prLinks;
  }

  /**
   * Suggest PR links for in-progress issues based on PR titles and branches
   */
  async suggestPRLinks(input: SuggestPRLinksInput): Promise<PRLinkSuggestion[]> {
    const { owner, repo, issueNumber, label } = input;

    // Get open issues (optionally filtered)
    const issues = await this.getOpenIssues(owner, repo, label);

    // Filter to specific issue if provided (exclude items without content)
    const targetIssues = issueNumber
      ? issues.filter((i) => i.content && i.content.number === issueNumber)
      : issues.filter((i) => i.content !== null);

    if (targetIssues.length === 0) {
      return [];
    }

    // Get open PRs
    const prs = await this.getOpenPRs(owner, repo);
    const suggestions: PRLinkSuggestion[] = [];

    for (const issue of targetIssues) {
      // Skip if no content (should not happen due to filter above, but TypeScript needs this)
      if (!issue.content) {
        continue;
      }

      // Check if issue already has linked PRs
      const existingLinks = await this.findLinkedPRs({
        owner,
        repo,
        issueNumber: issue.content.number,
      });

      const linkedPRNumbers = new Set(existingLinks.map((l) => l.prNumber));

      // Find PRs that might be related to this issue
      for (const pr of prs) {
        if (linkedPRNumbers.has(pr.number)) {
          continue; // Skip already linked PRs
        }

        const { confidence, reason } = this.calculatePRMatchConfidence(issue, pr);

        if (confidence >= this.minSuggestionConfidence) {
          suggestions.push({
            issueNumber: issue.content.number,
            issueTitle: issue.content.title,
            suggestedPR: {
              number: pr.number,
              title: pr.title,
              url: pr.html_url,
              state: 'open',
              author: pr.user.login,
            },
            confidence,
            reason,
          });
        }
      }
    }

    // Sort by confidence (highest first)
    suggestions.sort((a, b) => b.confidence - a.confidence);

    return suggestions;
  }

  /**
   * Parse natural language link request
   * Supports formats like:
   * - "link issue #12 to PR #45"
   * - "link task PDF extraction to PR #45"
   * - "what PRs are linked to #12"
   * - "find PRs for authentication task"
   * - "suggest PRs for in-progress issues"
   */
  parseLinkRequest(input: string): LinkRequest | null {
    // Link patterns
    const linkPatterns = [
      // "link issue #X to PR #Y"
      /^link\s+(?:issue\s+)?#?(\d+)\s+to\s+(?:PR|pull request)\s+#?(\d+)$/i,
      // "link task [query] to PR #Y"
      /^link\s+(?:task|issue)\s+(.+?)\s+to\s+(?:PR|pull request)\s+#?(\d+)$/i,
    ];

    for (const pattern of linkPatterns) {
      const match = input.match(pattern);
      if (match) {
        const issueQuery = match[1].trim();
        const prNumber = parseInt(match[2], 10);
        return {
          action: 'link',
          issueQuery,
          prNumber,
        };
      }
    }

    // Find linked PRs patterns
    const findPatterns = [
      // "what PRs are linked to #X"
      /^(?:what|which)\s+(?:PRs?|pull requests?)\s+(?:are\s+)?linked\s+to\s+#?(\d+)$/i,
      // "find PRs for [query]"
      /^find\s+(?:PRs?|pull requests?)\s+(?:for|linked to)\s+(.+)$/i,
      // "PRs for #X"
      /^(?:PRs?|pull requests?)\s+(?:for|linked to)\s+#?(\d+)$/i,
    ];

    for (const pattern of findPatterns) {
      const match = input.match(pattern);
      if (match) {
        return {
          action: 'find',
          issueQuery: match[1].trim(),
        };
      }
    }

    // Suggest patterns
    const suggestPatterns = [
      // "suggest PRs for in-progress issues"
      /^suggest\s+(?:PRs?|pull requests?)\s+(?:for\s+)?(?:in[- ]progress\s+)?issues?$/i,
      // "suggest PR links"
      /^suggest\s+(?:PR|pull request)\s+links?$/i,
    ];

    for (const pattern of suggestPatterns) {
      if (pattern.test(input)) {
        return {
          action: 'suggest',
        };
      }
    }

    return null;
  }

  /**
   * Get the underlying GitHub client for advanced operations
   */
  getGitHubClient(): GitHubClient {
    return this.githubClient;
  }

  /**
   * Get a PR by number
   */
  private async getPR(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<{ number: number; title: string; state: string; html_url: string } | null> {
    const response = await fetch(
      `${GITHUB_REST_ENDPOINT}/repos/${owner}/${repo}/pulls/${prNumber}`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      const errorBody = await response.text();
      throw new GitHubClientError(
        `Failed to get PR: ${response.statusText} - ${errorBody}`,
        response.status
      );
    }

    return (await response.json()) as {
      number: number;
      title: string;
      state: string;
      html_url: string;
    };
  }

  /**
   * Get PR state (need to check if merged)
   */
  private async getPRState(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<'open' | 'closed' | 'merged'> {
    const response = await fetch(
      `${GITHUB_REST_ENDPOINT}/repos/${owner}/${repo}/pulls/${prNumber}`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!response.ok) {
      return 'closed'; // Default if we can't determine
    }

    const pr = (await response.json()) as {
      state: 'open' | 'closed';
      merged_at: string | null;
    };

    if (pr.merged_at) {
      return 'merged';
    }
    return pr.state;
  }

  /**
   * Find PRs that use closing keywords for this issue
   */
  private async findClosingPRs(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<PRLink[]> {
    // Search for PRs that reference this issue with closing keywords
    const searchQuery = `repo:${owner}/${repo} is:pr closes:#${issueNumber} OR fixes:#${issueNumber} OR resolves:#${issueNumber}`;

    const response = await fetch(
      `${GITHUB_REST_ENDPOINT}/search/issues?q=${encodeURIComponent(searchQuery)}`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!response.ok) {
      // Search API can be rate-limited, just return empty
      return [];
    }

    const searchResult = (await response.json()) as {
      items: Array<{
        number: number;
        title: string;
        html_url: string;
        state: 'open' | 'closed';
        pull_request?: { merged_at: string | null };
        user: { login: string };
        created_at: string;
      }>;
    };

    return searchResult.items.map((item) => ({
      prNumber: item.number,
      prTitle: item.title,
      prUrl: item.html_url,
      prState: item.pull_request?.merged_at
        ? 'merged'
        : (item.state as 'open' | 'closed'),
      linkedAt: item.created_at,
      linkedBy: item.user.login,
      linkType: 'closing' as const,
    }));
  }

  /**
   * Get open issues from a repository
   */
  private async getOpenIssues(
    owner: string,
    repo: string,
    label?: string
  ): Promise<ProjectItem[]> {
    const params = new URLSearchParams({
      state: 'open',
      per_page: '100',
    });

    if (label) {
      params.set('labels', label);
    }

    const response = await fetch(
      `${GITHUB_REST_ENDPOINT}/repos/${owner}/${repo}/issues?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new GitHubClientError(
        `Failed to fetch issues: ${response.statusText} - ${errorBody}`,
        response.status
      );
    }

    const issues = (await response.json()) as Array<{
      id: number;
      node_id: string;
      number: number;
      title: string;
      state: string;
      html_url: string;
      labels: Array<{ name: string }>;
      assignees: Array<{ login: string }>;
      updated_at: string;
      closed_at: string | null;
      pull_request?: unknown;
    }>;

    // Filter out PRs (they show up in issues endpoint)
    return issues
      .filter((issue) => !issue.pull_request)
      .map((issue) => ({
        id: issue.node_id,
        fieldValues: { nodes: [] },
        content: {
          id: issue.node_id,
          number: issue.number,
          title: issue.title,
          url: issue.html_url,
          state: issue.state.toUpperCase() as 'OPEN' | 'CLOSED',
          labels: { nodes: issue.labels.map((l) => ({ name: l.name })) },
          assignees: { nodes: issue.assignees.map((a) => ({ login: a.login })) },
          updatedAt: issue.updated_at,
          closedAt: issue.closed_at,
        },
      }));
  }

  /**
   * Get open PRs from a repository
   */
  private async getOpenPRs(
    owner: string,
    repo: string
  ): Promise<
    Array<{
      number: number;
      title: string;
      html_url: string;
      head: { ref: string };
      body: string | null;
      user: { login: string };
    }>
  > {
    const response = await fetch(
      `${GITHUB_REST_ENDPOINT}/repos/${owner}/${repo}/pulls?state=open&per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new GitHubClientError(
        `Failed to fetch PRs: ${response.statusText} - ${errorBody}`,
        response.status
      );
    }

    return (await response.json()) as Array<{
      number: number;
      title: string;
      html_url: string;
      head: { ref: string };
      body: string | null;
      user: { login: string };
    }>;
  }

  /**
   * Calculate how well a PR matches an issue
   */
  private calculatePRMatchConfidence(
    issue: ProjectItem,
    pr: {
      number: number;
      title: string;
      head: { ref: string };
      body: string | null;
    }
  ): { confidence: number; reason: string } {
    // Guard against null content (should not happen due to prior filtering)
    if (!issue.content) {
      return { confidence: 0, reason: 'Issue has no content' };
    }

    const issueTitle = issue.content.title.toLowerCase();
    const issueNumber = issue.content.number;
    const prTitle = pr.title.toLowerCase();
    const prBranch = pr.head.ref.toLowerCase();
    const prBody = pr.body?.toLowerCase() ?? '';

    // Check for explicit issue reference in PR
    const issueRefPattern = new RegExp(`#${issueNumber}\\b|issue[- ]?${issueNumber}\\b`, 'i');
    if (issueRefPattern.test(pr.title) || issueRefPattern.test(pr.body ?? '')) {
      return { confidence: 0.95, reason: `PR explicitly references issue #${issueNumber}` };
    }

    // Check for issue number in branch name
    if (prBranch.includes(`${issueNumber}`) || prBranch.includes(`issue-${issueNumber}`)) {
      return { confidence: 0.9, reason: `Branch name contains issue number ${issueNumber}` };
    }

    // Check for keyword overlap between titles
    const issueWords = this.extractKeywords(issueTitle);
    const prTitleWords = this.extractKeywords(prTitle);
    const prBranchWords = this.extractKeywords(prBranch.replace(/[-_]/g, ' '));

    const titleOverlap = this.calculateWordOverlap(issueWords, prTitleWords);
    const branchOverlap = this.calculateWordOverlap(issueWords, prBranchWords);

    const maxOverlap = Math.max(titleOverlap, branchOverlap);

    if (maxOverlap >= 0.7) {
      return {
        confidence: maxOverlap * 0.8, // Scale down slightly
        reason: `High keyword overlap between issue and PR ${titleOverlap > branchOverlap ? 'title' : 'branch'}`,
      };
    }

    if (maxOverlap >= 0.5) {
      return {
        confidence: maxOverlap * 0.7,
        reason: `Moderate keyword overlap between issue and PR`,
      };
    }

    return { confidence: 0, reason: 'No significant match found' };
  }

  /**
   * Extract meaningful keywords from text
   */
  private extractKeywords(text: string): Set<string> {
    const stopWords = new Set([
      'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
      'this', 'that', 'these', 'those', 'it', 'its', 'add', 'update',
      'fix', 'feature', 'bug', 'issue', 'pr', 'pull', 'request',
    ]);

    const words = text
      .toLowerCase()
      .split(/\W+/)
      .filter((word) => word.length > 2 && !stopWords.has(word));

    return new Set(words);
  }

  /**
   * Calculate overlap between two sets of words
   */
  private calculateWordOverlap(set1: Set<string>, set2: Set<string>): number {
    if (set1.size === 0 || set2.size === 0) {
      return 0;
    }

    let overlap = 0;
    for (const word of set1) {
      if (set2.has(word)) {
        overlap++;
      }
    }

    // Jaccard similarity
    const union = new Set([...set1, ...set2]);
    return overlap / union.size;
  }
}

/**
 * Create a link service instance
 */
export function createLinkService(
  token: string,
  options?: Partial<LinkServiceOptions>
): LinkService {
  if (!token) {
    throw new GitHubClientError('GitHub token is required');
  }
  return new LinkService({ token, ...options });
}
