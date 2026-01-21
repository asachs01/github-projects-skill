/**
 * Comment service for adding notes/comments to GitHub issues
 * Uses the GitHub REST API for comment operations and existing
 * GraphQL client for project item resolution
 */
import { GitHubClient } from '../github/client.js';
import type { AddCommentInput, AddNoteInput, Comment, AddNoteResult, CommentServiceOptions, NoteRequest } from './types.js';
/**
 * Comment service for adding notes and comments to GitHub issues
 */
export declare class CommentService {
    private token;
    private githubClient;
    private minMatchScore;
    constructor(options: CommentServiceOptions);
    /**
     * Add a comment to an issue using the REST API
     */
    addComment(input: AddCommentInput): Promise<Comment>;
    /**
     * Add a note to an issue using fuzzy matching to find the issue
     * This is the main entry point for natural language commands like
     * "add note to PDF extraction: Started on this today"
     */
    addNote(input: AddNoteInput): Promise<AddNoteResult>;
    /**
     * Add a note to an issue in a project using project context
     */
    addNoteToProjectItem(org: string, projectNumber: number, query: string, note: string, repoOwner: string, repoName: string, isOrg?: boolean): Promise<AddNoteResult>;
    /**
     * Parse natural language note request
     * Supports formats like:
     * - "add note to PDF extraction: Started on this today"
     * - "comment on #12: Needs design review first"
     * - "reply to authentication: waiting for design team"
     */
    parseNoteRequest(input: string): NoteRequest | null;
    /**
     * Get the underlying GitHub client for advanced operations
     */
    getGitHubClient(): GitHubClient;
    /**
     * Get issues from a repository (for non-project based workflows)
     * Returns them as ProjectItem format for compatibility with matcher
     */
    private getRepoIssues;
    /**
     * Map GitHub API response to simplified Comment type
     */
    private mapToComment;
}
/**
 * Create a comment service instance
 */
export declare function createCommentService(token: string, options?: Partial<CommentServiceOptions>): CommentService;
//# sourceMappingURL=service.d.ts.map