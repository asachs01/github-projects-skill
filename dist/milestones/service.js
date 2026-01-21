/**
 * Milestone management service using GitHub REST API
 */
import { GitHubClient, GitHubClientError } from '../github/client.js';
import { MilestoneNotFoundError } from './types.js';
const GITHUB_REST_ENDPOINT = 'https://api.github.com';
/**
 * Milestone service for creating and managing GitHub milestones
 */
export class MilestoneService {
    token;
    githubClient;
    constructor(options) {
        this.token = options.token;
        this.githubClient = new GitHubClient({ token: options.token });
    }
    /**
     * Create a new milestone in a repository
     */
    async createMilestone(input) {
        const { owner, repo, title, description, dueOn, state } = input;
        const requestBody = {
            title,
        };
        if (description !== undefined) {
            requestBody.description = description;
        }
        if (dueOn !== undefined) {
            requestBody.due_on = dueOn;
        }
        if (state !== undefined) {
            requestBody.state = state;
        }
        const response = await fetch(`${GITHUB_REST_ENDPOINT}/repos/${owner}/${repo}/milestones`, {
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
                throw new GitHubClientError(`Invalid milestone data: ${errorBody}`, 422);
            }
            throw new GitHubClientError(`Failed to create milestone: ${response.statusText} - ${errorBody}`, response.status);
        }
        const milestoneResponse = (await response.json());
        return this.mapToMilestone(milestoneResponse);
    }
    /**
     * Update an existing milestone
     */
    async updateMilestone(input) {
        const { owner, repo, milestoneNumber, title, description, dueOn, state } = input;
        const requestBody = {};
        if (title !== undefined) {
            requestBody.title = title;
        }
        if (description !== undefined) {
            requestBody.description = description;
        }
        if (dueOn !== undefined) {
            requestBody.due_on = dueOn;
        }
        if (state !== undefined) {
            requestBody.state = state;
        }
        const response = await fetch(`${GITHUB_REST_ENDPOINT}/repos/${owner}/${repo}/milestones/${milestoneNumber}`, {
            method: 'PATCH',
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
                throw new MilestoneNotFoundError(milestoneNumber);
            }
            if (response.status === 422) {
                throw new GitHubClientError(`Invalid milestone data: ${errorBody}`, 422);
            }
            throw new GitHubClientError(`Failed to update milestone: ${response.statusText} - ${errorBody}`, response.status);
        }
        const milestoneResponse = (await response.json());
        return this.mapToMilestone(milestoneResponse);
    }
    /**
     * Get a milestone by number
     */
    async getMilestone(owner, repo, milestoneNumber) {
        const response = await fetch(`${GITHUB_REST_ENDPOINT}/repos/${owner}/${repo}/milestones/${milestoneNumber}`, {
            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
        });
        if (!response.ok) {
            if (response.status === 401) {
                throw new GitHubClientError('Authentication failed. Check your GitHub token.', 401);
            }
            if (response.status === 404) {
                throw new MilestoneNotFoundError(milestoneNumber);
            }
            const errorBody = await response.text();
            throw new GitHubClientError(`Failed to get milestone: ${response.statusText} - ${errorBody}`, response.status);
        }
        const milestoneResponse = (await response.json());
        return this.mapToMilestone(milestoneResponse);
    }
    /**
     * List milestones for a repository
     */
    async listMilestones(input) {
        const { owner, repo, state = 'open', sort = 'due_on', direction = 'asc' } = input;
        const params = new URLSearchParams({
            state,
            sort,
            direction,
            per_page: '100',
        });
        const response = await fetch(`${GITHUB_REST_ENDPOINT}/repos/${owner}/${repo}/milestones?${params.toString()}`, {
            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
        });
        if (!response.ok) {
            const errorBody = await response.text();
            if (response.status === 401) {
                throw new GitHubClientError('Authentication failed. Check your GitHub token.', 401);
            }
            if (response.status === 404) {
                throw new GitHubClientError(`Repository ${owner}/${repo} not found or not accessible.`, 404);
            }
            throw new GitHubClientError(`Failed to list milestones: ${response.statusText} - ${errorBody}`, response.status);
        }
        const milestonesResponse = (await response.json());
        return milestonesResponse.map((m) => this.mapToMilestone(m));
    }
    /**
     * Delete a milestone
     */
    async deleteMilestone(owner, repo, milestoneNumber) {
        const response = await fetch(`${GITHUB_REST_ENDPOINT}/repos/${owner}/${repo}/milestones/${milestoneNumber}`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
        });
        if (!response.ok) {
            if (response.status === 401) {
                throw new GitHubClientError('Authentication failed. Check your GitHub token.', 401);
            }
            if (response.status === 404) {
                throw new MilestoneNotFoundError(milestoneNumber);
            }
            const errorBody = await response.text();
            throw new GitHubClientError(`Failed to delete milestone: ${response.statusText} - ${errorBody}`, response.status);
        }
    }
    /**
     * Assign a milestone to an issue
     */
    async assignMilestoneToIssue(input) {
        const { owner, repo, issueNumber, milestoneNumber } = input;
        const response = await fetch(`${GITHUB_REST_ENDPOINT}/repos/${owner}/${repo}/issues/${issueNumber}`, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
            body: JSON.stringify({ milestone: milestoneNumber }),
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
                throw new GitHubClientError(`Issue #${issueNumber} not found in ${owner}/${repo}.`, 404);
            }
            if (response.status === 422) {
                throw new GitHubClientError(`Invalid milestone assignment: ${errorBody}`, 422);
            }
            throw new GitHubClientError(`Failed to assign milestone: ${response.statusText} - ${errorBody}`, response.status);
        }
        const issueResponse = (await response.json());
        return {
            issueNumber,
            milestoneNumber: issueResponse.milestone?.number ?? null,
            milestoneTitle: issueResponse.milestone?.title ?? null,
        };
    }
    /**
     * Find a milestone by title (fuzzy match)
     */
    async findMilestoneByTitle(owner, repo, title) {
        const milestones = await this.listMilestones({ owner, repo, state: 'all' });
        // Exact match first
        const exactMatch = milestones.find((m) => m.title.toLowerCase() === title.toLowerCase());
        if (exactMatch) {
            return exactMatch;
        }
        // Partial match
        const partialMatch = milestones.find((m) => m.title.toLowerCase().includes(title.toLowerCase()));
        if (partialMatch) {
            return partialMatch;
        }
        return null;
    }
    /**
     * Parse natural language milestone request
     * Supports formats like:
     * - "create milestone Sprint 1"
     * - "create milestone Sprint 1 due next Friday"
     * - "create milestone Q1 2024 for project-name"
     * - "list milestones"
     * - "list milestones for project-name"
     */
    parseMilestoneRequest(input) {
        // Create milestone patterns
        const createPatterns = [
            // "create milestone [name] due [date]"
            /^create\s+milestone\s+([^,]+?)\s+due\s+(.+?)(?:\s+for\s+(.+))?$/i,
            // "create milestone [name] for [project]"
            /^create\s+milestone\s+([^,]+?)\s+for\s+(.+)$/i,
            // "create milestone [name]"
            /^create\s+milestone\s+(.+)$/i,
        ];
        for (const pattern of createPatterns) {
            const match = input.match(pattern);
            if (match) {
                const result = {
                    action: 'create',
                    title: match[1].trim(),
                };
                // Handle different capture groups based on pattern
                if (pattern.source.includes('due')) {
                    result.dueDate = match[2]?.trim();
                    result.project = match[3]?.trim();
                }
                else if (pattern.source.includes('for')) {
                    result.project = match[2]?.trim();
                }
                return result;
            }
        }
        // List milestones patterns
        const listPatterns = [
            // "list milestones for [project]"
            /^list\s+milestones?\s+for\s+(.+)$/i,
            // "list milestones"
            /^list\s+milestones?$/i,
            // "show milestones for [project]"
            /^show\s+milestones?\s+for\s+(.+)$/i,
            // "show milestones"
            /^show\s+milestones?$/i,
        ];
        for (const pattern of listPatterns) {
            const match = input.match(pattern);
            if (match) {
                return {
                    action: 'list',
                    project: match[1]?.trim(),
                };
            }
        }
        return null;
    }
    /**
     * Parse a natural language date into ISO 8601 format
     * Handles: "next Friday", "in 2 weeks", "2024-12-31", "December 31, 2024"
     */
    parseDueDate(dateStr) {
        const now = new Date();
        // Handle relative dates
        const relativePatterns = [
            // "next [day]"
            {
                pattern: /^next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i,
                handler: (match) => {
                    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                    const targetDay = days.indexOf(match[1].toLowerCase());
                    const currentDay = now.getDay();
                    let daysToAdd = targetDay - currentDay;
                    if (daysToAdd <= 0)
                        daysToAdd += 7;
                    const result = new Date(now);
                    result.setDate(result.getDate() + daysToAdd);
                    return result;
                },
            },
            // "in X days/weeks/months"
            {
                pattern: /^in\s+(\d+)\s+(day|week|month)s?$/i,
                handler: (match) => {
                    const amount = parseInt(match[1], 10);
                    const unit = match[2].toLowerCase();
                    const result = new Date(now);
                    if (unit === 'day') {
                        result.setDate(result.getDate() + amount);
                    }
                    else if (unit === 'week') {
                        result.setDate(result.getDate() + amount * 7);
                    }
                    else if (unit === 'month') {
                        result.setMonth(result.getMonth() + amount);
                    }
                    return result;
                },
            },
            // "tomorrow"
            {
                pattern: /^tomorrow$/i,
                handler: () => {
                    const result = new Date(now);
                    result.setDate(result.getDate() + 1);
                    return result;
                },
            },
            // "end of month"
            {
                pattern: /^end\s+of\s+(?:this\s+)?month$/i,
                handler: () => {
                    const result = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                    return result;
                },
            },
            // "end of quarter"
            {
                pattern: /^end\s+of\s+(?:this\s+)?quarter$/i,
                handler: () => {
                    const quarter = Math.floor(now.getMonth() / 3);
                    const result = new Date(now.getFullYear(), (quarter + 1) * 3, 0);
                    return result;
                },
            },
        ];
        for (const { pattern, handler } of relativePatterns) {
            const match = dateStr.match(pattern);
            if (match) {
                const date = handler(match);
                return date.toISOString();
            }
        }
        // Try to parse as a date string directly
        const parsed = Date.parse(dateStr);
        if (!isNaN(parsed)) {
            return new Date(parsed).toISOString();
        }
        return null;
    }
    /**
     * Get the underlying GitHub client for advanced operations
     */
    getGitHubClient() {
        return this.githubClient;
    }
    /**
     * Map GitHub API response to simplified Milestone type
     */
    mapToMilestone(response) {
        const totalIssues = response.open_issues + response.closed_issues;
        const progress = totalIssues > 0
            ? Math.round((response.closed_issues / totalIssues) * 100)
            : 0;
        return {
            id: response.id,
            nodeId: response.node_id,
            number: response.number,
            title: response.title,
            description: response.description,
            state: response.state,
            openIssues: response.open_issues,
            closedIssues: response.closed_issues,
            dueOn: response.due_on,
            url: response.html_url,
            createdAt: response.created_at,
            updatedAt: response.updated_at,
            closedAt: response.closed_at,
            progress,
        };
    }
}
/**
 * Create a milestone service instance
 */
export function createMilestoneService(token) {
    if (!token) {
        throw new GitHubClientError('GitHub token is required');
    }
    return new MilestoneService({ token });
}
//# sourceMappingURL=service.js.map