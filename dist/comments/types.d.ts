/**
 * Comment and note management types for GitHub REST API
 */
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
export declare class IssueNotFoundError extends Error {
    readonly query: string;
    readonly suggestions?: string[] | undefined;
    constructor(query: string, suggestions?: string[] | undefined);
}
/**
 * Error thrown when multiple issues match ambiguously
 */
export declare class AmbiguousIssueMatchError extends Error {
    readonly query: string;
    readonly matches: Array<{
        title: string;
        number: number;
        score: number;
    }>;
    constructor(query: string, matches: Array<{
        title: string;
        number: number;
        score: number;
    }>);
}
//# sourceMappingURL=types.d.ts.map