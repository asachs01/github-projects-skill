/**
 * Issue management service using GitHub REST API for issue creation
 * and existing GraphQL client for project operations
 */
import { GitHubClient, GitHubClientError } from '../github/client.js';
const GITHUB_REST_ENDPOINT = 'https://api.github.com';
/**
 * Issue service for creating issues and managing them in projects
 */
export class IssueService {
    token;
    githubClient;
    constructor(options) {
        this.token = options.token;
        this.githubClient = new GitHubClient({ token: options.token });
    }
    /**
     * Create a new issue in a repository using the REST API
     */
    async createIssue(input) {
        const { owner, repo, title, body, labels, assignees, milestone } = input;
        const requestBody = {
            title,
        };
        if (body !== undefined) {
            requestBody.body = body;
        }
        if (labels !== undefined && labels.length > 0) {
            requestBody.labels = labels;
        }
        if (assignees !== undefined && assignees.length > 0) {
            requestBody.assignees = assignees;
        }
        if (milestone !== undefined) {
            requestBody.milestone = milestone;
        }
        const response = await fetch(`${GITHUB_REST_ENDPOINT}/repos/${owner}/${repo}/issues`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
            body: JSON.stringify(requestBody),
        });
        if (!response.ok) {
            const errorBody = await response.text();
            if (response.status === 401) {
                throw new GitHubClientError('Authentication failed. Check your GitHub token.', 401);
            }
            if (response.status === 403) {
                throw new GitHubClientError('Access denied. Ensure your token has repo scope.', 403);
            }
            if (response.status === 404) {
                throw new GitHubClientError(`Repository ${owner}/${repo} not found or not accessible.`, 404);
            }
            if (response.status === 422) {
                throw new GitHubClientError(`Invalid issue data: ${errorBody}`, 422);
            }
            throw new GitHubClientError(`Failed to create issue: ${response.statusText} - ${errorBody}`, response.status);
        }
        const issueResponse = (await response.json());
        return this.mapToIssue(issueResponse);
    }
    /**
     * Add an issue to a GitHub project
     * Uses the GitHubClient's existing addItemToProject method
     */
    async addIssueToProject(projectId, issueNodeId) {
        const itemId = await this.githubClient.addItemToProject(projectId, issueNodeId);
        return {
            itemId,
            issueNodeId,
        };
    }
    /**
     * Set the status of an issue in a project
     * Requires the project context to resolve status name to option ID
     */
    async setIssueStatus(projectId, itemId, status, org, projectNumber, isOrg = true) {
        // Get project context to resolve status field and option IDs
        const projectContext = await this.githubClient.getProject(org, projectNumber, isOrg);
        // Look up the status option ID (case-insensitive)
        const statusLower = status.toLowerCase();
        const optionId = projectContext.statusOptions.get(statusLower);
        if (!optionId) {
            const availableStatuses = Array.from(projectContext.statusOptions.keys());
            throw new GitHubClientError(`Status "${status}" not found in project. Available statuses: ${availableStatuses.join(', ')}`);
        }
        await this.githubClient.updateItemStatus(projectId, itemId, projectContext.statusFieldId, optionId);
        return {
            itemId,
            status,
        };
    }
    /**
     * Convenience method: Create issue and add it to a project in one operation
     */
    async createIssueInProject(input, projectId, initialStatus, org, projectNumber, isOrg) {
        // Create the issue first
        const issue = await this.createIssue(input);
        // Add it to the project
        const { itemId } = await this.addIssueToProject(projectId, issue.nodeId);
        // Set initial status if provided
        if (initialStatus && org && projectNumber !== undefined) {
            await this.setIssueStatus(projectId, itemId, initialStatus, org, projectNumber, isOrg);
        }
        return {
            issue,
            projectItemId: itemId,
        };
    }
    /**
     * Get the underlying GitHub client for advanced operations
     */
    getGitHubClient() {
        return this.githubClient;
    }
    /**
     * Map GitHub API response to simplified Issue type
     */
    mapToIssue(response) {
        return {
            id: response.id,
            nodeId: response.node_id,
            number: response.number,
            title: response.title,
            body: response.body,
            state: response.state,
            url: response.html_url,
            labels: response.labels.map((l) => l.name),
            assignees: response.assignees.map((a) => a.login),
        };
    }
}
/**
 * Create an issue service instance
 */
export function createIssueService(token) {
    if (!token) {
        throw new GitHubClientError('GitHub token is required');
    }
    return new IssueService({ token });
}
//# sourceMappingURL=service.js.map