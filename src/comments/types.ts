/**
 * Comment and note management types for GitHub REST API
 */

import type { ProjectItem } from '../github/types.js';

/**
 * Input for adding a comment to an issue
 */
export interface AddCommentInput {
  owner: string;
  repo: string;
  issueNumber: number;
  body: string;
}

/**
 * Input for adding a comment using natural language query
 */
export interface AddNoteInput {
  owner: string;
  repo: string;
  query: string;
  note: string;
}

/**
 * Response from GitHub REST API when creating a comment
 */
export interface GitHubCommentResponse {
  id: number;
  node_id: string;
  url: string;
  html_url: string;
  body: string;
  user: {
    id: number;
    login: string;
    avatar_url: string;
  };
  created_at: string;
  updated_at: string;
  issue_url: string;
}

/**
 * Simplified comment representation for internal use
 */
export interface Comment {
  id: number;
  nodeId: string;
  body: string;
  author: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Result from adding a note/comment
 */
export interface AddNoteResult {
  success: boolean;
  comment: Comment;
  issueNumber: number;
  issueTitle: string;
  matchScore: number;
  message?: string;
}

/**
 * Options for comment service operations
 */
export interface CommentServiceOptions {
  token: string;
  /** Minimum match score threshold (0-1) for fuzzy matching */
  minMatchScore?: number;
}

/**
 * Parsed note request from natural language input
 */
export interface NoteRequest {
  /** The search query to find the issue (title, partial title, or issue number) */
  query: string;
  /** The note text to add as a comment */
  note: string;
}

/**
 * Error thrown when no matching issue is found
 */
export class IssueNotFoundError extends Error {
  constructor(
    public readonly query: string,
    public readonly suggestions?: string[]
  ) {
    const message = suggestions && suggestions.length > 0
      ? `No issue found matching "${query}". Did you mean: ${suggestions.join(', ')}?`
      : `No issue found matching "${query}"`;
    super(message);
    this.name = 'IssueNotFoundError';
  }
}

/**
 * Error thrown when multiple issues match ambiguously
 */
export class AmbiguousIssueMatchError extends Error {
  constructor(
    public readonly query: string,
    public readonly matches: Array<{ title: string; number: number; score: number }>
  ) {
    const matchList = matches.map(m => `#${m.number}: ${m.title}`).join(', ');
    super(`Multiple issues match "${query}": ${matchList}. Please be more specific.`);
    this.name = 'AmbiguousIssueMatchError';
  }
}
