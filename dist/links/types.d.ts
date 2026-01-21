/**
 * PR-Issue linking types for GitHub REST API
 */
/**
 * Input for linking a PR to an issue
 */
export interface LinkPRToIssueInput {
    owner: string;
    repo: string;
    issueNumber: number;
    prNumber: number;
    /** Optional message to include with the link */
    message?: string;
}
/**
 * Input for finding linked PRs for an issue
 */
export interface FindLinkedPRsInput {
    owner: string;
    repo: string;
    issueNumber: number;
}
/**
 * Input for suggesting PR links for in-progress issues
 */
export interface SuggestPRLinksInput {
    owner: string;
    repo: string;
    /** Optional: specific issue number to check */
    issueNumber?: number;
    /** Filter to only issues with specific label */
    label?: string;
}
/**
 * GitHub PR reference in timeline
 */
export interface GitHubPRReference {
    id: number;
    node_id: string;
    number: number;
    title: string;
    state: 'open' | 'closed' | 'merged';
    html_url: string;
    created_at: string;
    merged_at: string | null;
    user: {
        id: number;
        login: string;
        avatar_url: string;
    };
}
/**
 * GitHub timeline event that may reference a PR
 */
export interface GitHubTimelineEvent {
    id: number;
    event: string;
    actor?: {
        id: number;
        login: string;
    };
    source?: {
        type: string;
        issue?: {
            number: number;
            title: string;
            html_url: string;
            pull_request?: {
                url: string;
                html_url: string;
                merged_at: string | null;
            };
        };
    };
    created_at: string;
}
/**
 * Simplified PR link representation
 */
export interface PRLink {
    prNumber: number;
    prTitle: string;
    prUrl: string;
    prState: 'open' | 'closed' | 'merged';
    linkedAt: string;
    linkedBy: string | null;
    /** How the PR is linked (e.g., "referenced", "mentioned", "closing") */
    linkType: 'referenced' | 'mentioned' | 'closing' | 'manual';
}
/**
 * Result from linking a PR to an issue
 */
export interface LinkPRResult {
    success: boolean;
    issueNumber: number;
    prNumber: number;
    message: string;
    /** URL of the comment if one was added */
    commentUrl?: string;
}
/**
 * Suggested PR link for an issue
 */
export interface PRLinkSuggestion {
    issueNumber: number;
    issueTitle: string;
    suggestedPR: {
        number: number;
        title: string;
        url: string;
        state: 'open' | 'closed' | 'merged';
        author: string;
    };
    /** Confidence score (0-1) */
    confidence: number;
    /** Reason for the suggestion */
    reason: string;
}
/**
 * Options for link service operations
 */
export interface LinkServiceOptions {
    token: string;
    /** Minimum confidence for PR suggestions (0-1) */
    minSuggestionConfidence?: number;
}
/**
 * Parsed link request from natural language input
 */
export interface LinkRequest {
    /** Action to perform */
    action: 'link' | 'find' | 'suggest';
    /** Issue query (number or title) */
    issueQuery?: string;
    /** PR number */
    prNumber?: number;
}
/**
 * Error thrown when PR is not found
 */
export declare class PRNotFoundError extends Error {
    readonly prNumber: number;
    readonly owner?: string | undefined;
    readonly repo?: string | undefined;
    constructor(prNumber: number, owner?: string | undefined, repo?: string | undefined);
}
/**
 * Error thrown when issue is not found
 */
export declare class IssueNotFoundError extends Error {
    readonly issueIdentifier: string | number;
    readonly suggestions?: string[] | undefined;
    constructor(issueIdentifier: string | number, suggestions?: string[] | undefined);
}
//# sourceMappingURL=types.d.ts.map