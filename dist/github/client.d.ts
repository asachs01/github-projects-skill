import type { ProjectItem, ProjectContext } from './types.js';
export interface GitHubClientOptions {
    token: string;
}
export declare class GitHubClientError extends Error {
    readonly statusCode?: number | undefined;
    readonly isRetryable: boolean;
    constructor(message: string, statusCode?: number | undefined, isRetryable?: boolean);
}
/**
 * GitHub GraphQL client with authentication and caching
 */
export declare class GitHubClient {
    private client;
    private token;
    private projectCache;
    constructor(options: GitHubClientOptions);
    /**
     * Validate the token by checking user info and scopes
     */
    validateToken(): Promise<{
        login: string;
        scopes: string[];
    }>;
    /**
     * Get a project by org/user and number, with caching
     */
    getProject(org: string, projectNumber: number, isOrg?: boolean): Promise<ProjectContext>;
    /**
     * Fetch project from GitHub API
     */
    private fetchProject;
    /**
     * Build project context from API response
     */
    private buildProjectContext;
    /**
     * Get all items from a project
     */
    getProjectItems(projectId: string): Promise<ProjectItem[]>;
    /**
     * Add an issue or PR to a project
     */
    addItemToProject(projectId: string, contentId: string): Promise<string>;
    /**
     * Update the status of a project item
     */
    updateItemStatus(projectId: string, itemId: string, fieldId: string, optionId: string): Promise<void>;
    /**
     * Clear the project cache
     */
    clearCache(): void;
    /**
     * Execute a GraphQL query with retry logic
     */
    private executeWithRetry;
    /**
     * Check if an error is retryable
     */
    private isRetryableError;
    /**
     * Wrap errors in GitHubClientError
     */
    private wrapError;
    /**
     * Sleep for the specified duration
     */
    private sleep;
}
/**
 * Create a GitHub client with the provided token
 */
export declare function createGitHubClient(token: string): GitHubClient;
//# sourceMappingURL=client.d.ts.map