/**
 * Issue management service using GitHub REST API for issue creation
 * and existing GraphQL client for project operations
 */
import { GitHubClient } from '../github/client.js';
import type { CreateIssueInput, Issue, AddIssueToProjectResult, SetIssueStatusResult, IssueServiceOptions } from './types.js';
/**
 * Issue service for creating issues and managing them in projects
 */
export declare class IssueService {
    private token;
    private githubClient;
    constructor(options: IssueServiceOptions);
    /**
     * Create a new issue in a repository using the REST API
     */
    createIssue(input: CreateIssueInput): Promise<Issue>;
    /**
     * Add an issue to a GitHub project
     * Uses the GitHubClient's existing addItemToProject method
     */
    addIssueToProject(projectId: string, issueNodeId: string): Promise<AddIssueToProjectResult>;
    /**
     * Set the status of an issue in a project
     * Requires the project context to resolve status name to option ID
     */
    setIssueStatus(projectId: string, itemId: string, status: string, org: string, projectNumber: number, isOrg?: boolean): Promise<SetIssueStatusResult>;
    /**
     * Convenience method: Create issue and add it to a project in one operation
     */
    createIssueInProject(input: CreateIssueInput, projectId: string, initialStatus?: string, org?: string, projectNumber?: number, isOrg?: boolean): Promise<{
        issue: Issue;
        projectItemId: string;
    }>;
    /**
     * Get the underlying GitHub client for advanced operations
     */
    getGitHubClient(): GitHubClient;
    /**
     * Map GitHub API response to simplified Issue type
     */
    private mapToIssue;
}
/**
 * Create an issue service instance
 */
export declare function createIssueService(token: string): IssueService;
//# sourceMappingURL=service.d.ts.map