/**
 * PR-Issue linking service using GitHub REST API
 * Provides functionality to link PRs to issues and find existing links
 */
import { GitHubClient } from '../github/client.js';
import type { LinkPRToIssueInput, FindLinkedPRsInput, SuggestPRLinksInput, PRLink, LinkPRResult, PRLinkSuggestion, LinkServiceOptions, LinkRequest } from './types.js';
/**
 * Link service for managing PR-issue relationships
 */
export declare class LinkService {
    private token;
    private githubClient;
    private minSuggestionConfidence;
    constructor(options: LinkServiceOptions);
    /**
     * Link a PR to an issue by adding a comment with the PR reference
     * This creates a manual link that shows up in the issue timeline
     */
    linkPRToIssue(input: LinkPRToIssueInput): Promise<LinkPRResult>;
    /**
     * Find all PRs linked to an issue using the timeline API
     */
    findLinkedPRs(input: FindLinkedPRsInput): Promise<PRLink[]>;
    /**
     * Suggest PR links for in-progress issues based on PR titles and branches
     */
    suggestPRLinks(input: SuggestPRLinksInput): Promise<PRLinkSuggestion[]>;
    /**
     * Parse natural language link request
     * Supports formats like:
     * - "link issue #12 to PR #45"
     * - "link task PDF extraction to PR #45"
     * - "what PRs are linked to #12"
     * - "find PRs for authentication task"
     * - "suggest PRs for in-progress issues"
     */
    parseLinkRequest(input: string): LinkRequest | null;
    /**
     * Get the underlying GitHub client for advanced operations
     */
    getGitHubClient(): GitHubClient;
    /**
     * Get a PR by number
     */
    private getPR;
    /**
     * Get PR state (need to check if merged)
     */
    private getPRState;
    /**
     * Find PRs that use closing keywords for this issue
     */
    private findClosingPRs;
    /**
     * Get open issues from a repository
     */
    private getOpenIssues;
    /**
     * Get open PRs from a repository
     */
    private getOpenPRs;
    /**
     * Calculate how well a PR matches an issue
     */
    private calculatePRMatchConfidence;
    /**
     * Extract meaningful keywords from text
     */
    private extractKeywords;
    /**
     * Calculate overlap between two sets of words
     */
    private calculateWordOverlap;
}
/**
 * Create a link service instance
 */
export declare function createLinkService(token: string, options?: Partial<LinkServiceOptions>): LinkService;
//# sourceMappingURL=service.d.ts.map