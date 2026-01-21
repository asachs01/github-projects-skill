/**
 * Comment service for adding notes/comments to GitHub issues
 * Uses the GitHub REST API for comment operations and existing
 * GraphQL client for project item resolution
 */

import { GitHubClient, GitHubClientError } from '../github/client.js';
import {
  findMatches,
  findBestMatch,
  getSuggestions,
  parseNumberQuery,
  DEFAULT_MIN_SCORE,
} from '../updates/matcher.js';
import type { ProjectItem } from '../github/types.js';
import type {
  AddCommentInput,
  AddNoteInput,
  GitHubCommentResponse,
  Comment,
  AddNoteResult,
  CommentServiceOptions,
  NoteRequest,
} from './types.js';
import { IssueNotFoundError, AmbiguousIssueMatchError } from './types.js';

const GITHUB_REST_ENDPOINT = 'https://api.github.com';

/** Threshold for considering a match ambiguous (if second best is close to best) */
const AMBIGUITY_THRESHOLD = 0.1;

/**
 * Comment service for adding notes and comments to GitHub issues
 */
export class CommentService {
  private token: string;
  private githubClient: GitHubClient;
  private minMatchScore: number;

  constructor(options: CommentServiceOptions) {
    this.token = options.token;
    this.githubClient = new GitHubClient({ token: options.token });
    this.minMatchScore = options.minMatchScore ?? DEFAULT_MIN_SCORE;
  }

  /**
   * Add a comment to an issue using the REST API
   */
  async addComment(input: AddCommentInput): Promise<Comment> {
    const { owner, repo, issueNumber, body } = input;

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
        body: JSON.stringify({ body }),
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
      if (response.status === 422) {
        throw new GitHubClientError(
          `Invalid comment data: ${errorBody}`,
          422
        );
      }
      throw new GitHubClientError(
        `Failed to add comment: ${response.statusText} - ${errorBody}`,
        response.status
      );
    }

    const commentResponse = (await response.json()) as GitHubCommentResponse;
    return this.mapToComment(commentResponse);
  }

  /**
   * Add a note to an issue using fuzzy matching to find the issue
   * This is the main entry point for natural language commands like
   * "add note to PDF extraction: Started on this today"
   */
  async addNote(input: AddNoteInput): Promise<AddNoteResult> {
    const { owner, repo, query, note } = input;

    // Get project items to search through
    // For now, we need to get the project context first
    // This assumes a project-based workflow; we can also support direct repo issues
    const items = await this.getRepoIssues(owner, repo);

    // Find matching item
    const matches = findMatches(items, query, this.minMatchScore);

    if (matches.length === 0) {
      const suggestions = getSuggestions(items, query);
      throw new IssueNotFoundError(query, suggestions);
    }

    // Check for ambiguous matches
    if (matches.length > 1) {
      const best = matches[0];
      const secondBest = matches[1];

      // If second best is too close to best, it's ambiguous
      if (best.score - secondBest.score < AMBIGUITY_THRESHOLD && best.score < 0.9) {
        throw new AmbiguousIssueMatchError(
          query,
          matches.slice(0, 3).map(m => ({
            title: m.title,
            number: m.number,
            score: m.score,
          }))
        );
      }
    }

    const match = matches[0];

    // Add the comment
    const comment = await this.addComment({
      owner,
      repo,
      issueNumber: match.number,
      body: note,
    });

    return {
      success: true,
      comment,
      issueNumber: match.number,
      issueTitle: match.title,
      matchScore: match.score,
      message: `Added note to #${match.number}: ${match.title}`,
    };
  }

  /**
   * Add a note to an issue in a project using project context
   */
  async addNoteToProjectItem(
    org: string,
    projectNumber: number,
    query: string,
    note: string,
    repoOwner: string,
    repoName: string,
    isOrg: boolean = true
  ): Promise<AddNoteResult> {
    // Get project context
    const projectContext = await this.githubClient.getProject(org, projectNumber, isOrg);

    // Get project items
    const items = await this.githubClient.getProjectItems(projectContext.projectId);

    // Find matching item
    const matches = findMatches(items, query, this.minMatchScore);

    if (matches.length === 0) {
      const suggestions = getSuggestions(items, query);
      throw new IssueNotFoundError(query, suggestions);
    }

    // Check for ambiguous matches
    if (matches.length > 1) {
      const best = matches[0];
      const secondBest = matches[1];

      if (best.score - secondBest.score < AMBIGUITY_THRESHOLD && best.score < 0.9) {
        throw new AmbiguousIssueMatchError(
          query,
          matches.slice(0, 3).map(m => ({
            title: m.title,
            number: m.number,
            score: m.score,
          }))
        );
      }
    }

    const match = matches[0];

    // Add the comment
    const comment = await this.addComment({
      owner: repoOwner,
      repo: repoName,
      issueNumber: match.number,
      body: note,
    });

    return {
      success: true,
      comment,
      issueNumber: match.number,
      issueTitle: match.title,
      matchScore: match.score,
      message: `Added note to #${match.number}: ${match.title}`,
    };
  }

  /**
   * Parse natural language note request
   * Supports formats like:
   * - "add note to PDF extraction: Started on this today"
   * - "comment on #12: Needs design review first"
   * - "reply to authentication: waiting for design team"
   */
  parseNoteRequest(input: string): NoteRequest | null {
    // Patterns to match natural language commands
    const patterns = [
      // "add note to [query]: [note]"
      /^(?:add\s+)?note\s+(?:to|on)\s+(.+?):\s*(.+)$/i,
      // "comment on [query]: [note]"
      /^comment\s+(?:to|on)\s+(.+?):\s*(.+)$/i,
      // "reply to [query]: [note]"
      /^reply\s+(?:to|on)\s+(.+?):\s*(.+)$/i,
      // "[query]: [note]" (simple format)
      /^(.+?):\s*(.+)$/i,
    ];

    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        const query = match[1].trim();
        const note = match[2].trim();

        // Make sure we have both parts
        if (query && note) {
          return { query, note };
        }
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
   * Get issues from a repository (for non-project based workflows)
   * Returns them as ProjectItem format for compatibility with matcher
   */
  private async getRepoIssues(owner: string, repo: string): Promise<ProjectItem[]> {
    const response = await fetch(
      `${GITHUB_REST_ENDPOINT}/repos/${owner}/${repo}/issues?state=all&per_page=100`,
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
      if (response.status === 401) {
        throw new GitHubClientError('Authentication failed. Check your GitHub token.', 401);
      }
      if (response.status === 404) {
        throw new GitHubClientError(
          `Repository ${owner}/${repo} not found or not accessible.`,
          404
        );
      }
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
    }>;

    // Convert to ProjectItem format for matcher compatibility
    return issues.map(issue => ({
      id: issue.node_id,
      fieldValues: { nodes: [] },
      content: {
        id: issue.node_id,
        number: issue.number,
        title: issue.title,
        url: issue.html_url,
        state: issue.state.toUpperCase() as 'OPEN' | 'CLOSED',
        labels: { nodes: issue.labels.map(l => ({ name: l.name })) },
        assignees: { nodes: issue.assignees.map(a => ({ login: a.login })) },
        updatedAt: issue.updated_at,
        closedAt: issue.closed_at,
      },
    }));
  }

  /**
   * Map GitHub API response to simplified Comment type
   */
  private mapToComment(response: GitHubCommentResponse): Comment {
    return {
      id: response.id,
      nodeId: response.node_id,
      body: response.body,
      author: response.user.login,
      url: response.html_url,
      createdAt: response.created_at,
      updatedAt: response.updated_at,
    };
  }
}

/**
 * Create a comment service instance
 */
export function createCommentService(token: string, options?: Partial<CommentServiceOptions>): CommentService {
  if (!token) {
    throw new GitHubClientError('GitHub token is required');
  }
  return new CommentService({ token, ...options });
}
