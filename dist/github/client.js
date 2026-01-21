import { GraphQLClient, ClientError } from 'graphql-request';
import { GET_USER_PROJECT, GET_ORG_PROJECT, GET_PROJECT_ITEMS, ADD_PROJECT_ITEM, UPDATE_PROJECT_ITEM_FIELD, } from './queries.js';
const GITHUB_GRAPHQL_ENDPOINT = 'https://api.github.com/graphql';
const GITHUB_REST_ENDPOINT = 'https://api.github.com';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
export class GitHubClientError extends Error {
    statusCode;
    isRetryable;
    constructor(message, statusCode, isRetryable = false) {
        super(message);
        this.statusCode = statusCode;
        this.isRetryable = isRetryable;
        this.name = 'GitHubClientError';
    }
}
/**
 * GitHub GraphQL client with authentication and caching
 */
export class GitHubClient {
    client;
    token;
    projectCache = new Map();
    constructor(options) {
        this.token = options.token;
        this.client = new GraphQLClient(GITHUB_GRAPHQL_ENDPOINT, {
            headers: {
                authorization: `Bearer ${this.token}`,
            },
        });
    }
    /**
     * Validate the token by checking user info and scopes
     */
    async validateToken() {
        const response = await fetch(`${GITHUB_REST_ENDPOINT}/user`, {
            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: 'application/vnd.github+json',
            },
        });
        if (!response.ok) {
            if (response.status === 401) {
                throw new GitHubClientError('Invalid or expired GitHub token', 401);
            }
            throw new GitHubClientError(`Token validation failed: ${response.statusText}`, response.status);
        }
        const scopes = response.headers.get('x-oauth-scopes')?.split(', ') ?? [];
        const user = await response.json();
        // Verify required scopes
        const requiredScopes = ['repo', 'project'];
        const missingScopes = requiredScopes.filter((s) => !scopes.some((scope) => scope.includes(s)));
        if (missingScopes.length > 0) {
            throw new GitHubClientError(`Token missing required scopes: ${missingScopes.join(', ')}. ` +
                `Current scopes: ${scopes.join(', ')}`);
        }
        return { login: user.login, scopes };
    }
    /**
     * Get a project by org/user and number, with caching
     */
    async getProject(org, projectNumber, isOrg = true) {
        const cacheKey = `${org}/${projectNumber}`;
        const cached = this.projectCache.get(cacheKey);
        if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
            return cached;
        }
        const project = await this.fetchProject(org, projectNumber, isOrg);
        const context = this.buildProjectContext(project);
        this.projectCache.set(cacheKey, context);
        return context;
    }
    /**
     * Fetch project from GitHub API
     */
    async fetchProject(org, projectNumber, isOrg) {
        const query = isOrg ? GET_ORG_PROJECT : GET_USER_PROJECT;
        const variables = { login: org, number: projectNumber };
        const response = await this.executeWithRetry(query, variables);
        const project = isOrg
            ? response.organization?.projectV2
            : response.user?.projectV2;
        if (!project) {
            // Try the other type (user vs org)
            const altQuery = isOrg ? GET_USER_PROJECT : GET_ORG_PROJECT;
            const altResponse = await this.executeWithRetry(altQuery, variables);
            const altProject = isOrg
                ? altResponse.user?.projectV2
                : altResponse.organization?.projectV2;
            if (!altProject) {
                throw new GitHubClientError(`Project #${projectNumber} not found for ${org}. ` +
                    `Ensure the project exists and your token has access.`);
            }
            return altProject;
        }
        return project;
    }
    /**
     * Build project context from API response
     */
    buildProjectContext(project) {
        // Find the Status field
        const statusField = project.fields?.nodes.find((f) => f.name === 'Status' && 'options' in f);
        if (!statusField) {
            throw new GitHubClientError(`No Status field found in project "${project.title}". ` +
                `GitHub Projects v2 must have a Status field.`);
        }
        // Build status options map
        const statusOptions = new Map();
        for (const option of statusField.options) {
            statusOptions.set(option.name.toLowerCase(), option.id);
        }
        return {
            projectId: project.id,
            projectNumber: project.number,
            statusFieldId: statusField.id,
            statusOptions,
            cachedAt: Date.now(),
        };
    }
    /**
     * Get all items from a project
     */
    async getProjectItems(projectId) {
        const allItems = [];
        let cursor = undefined;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const response = await this.executeWithRetry(GET_PROJECT_ITEMS, { projectId, first: 100, after: cursor });
            if (!response.node?.items) {
                break;
            }
            allItems.push(...response.node.items.nodes);
            if (!response.node.items.pageInfo.hasNextPage) {
                break;
            }
            cursor = response.node.items.pageInfo.endCursor ?? undefined;
        }
        return allItems;
    }
    /**
     * Add an issue or PR to a project
     */
    async addItemToProject(projectId, contentId) {
        const response = await this.executeWithRetry(ADD_PROJECT_ITEM, { projectId, contentId });
        return response.addProjectV2ItemById.item.id;
    }
    /**
     * Update the status of a project item
     */
    async updateItemStatus(projectId, itemId, fieldId, optionId) {
        await this.executeWithRetry(UPDATE_PROJECT_ITEM_FIELD, { projectId, itemId, fieldId, singleSelectOptionId: optionId });
    }
    /**
     * Clear the project cache
     */
    clearCache() {
        this.projectCache.clear();
    }
    /**
     * Execute a GraphQL query with retry logic
     */
    async executeWithRetry(query, variables) {
        let lastError = null;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                return await this.client.request(query, variables);
            }
            catch (error) {
                lastError = error;
                if (!this.isRetryableError(error)) {
                    throw this.wrapError(error);
                }
                // Exponential backoff
                const delay = BASE_DELAY_MS * Math.pow(2, attempt);
                await this.sleep(delay);
            }
        }
        throw this.wrapError(lastError);
    }
    /**
     * Check if an error is retryable
     */
    isRetryableError(error) {
        if (error instanceof ClientError) {
            const status = error.response?.status;
            return status === 502 || status === 503 || status === 429;
        }
        return false;
    }
    /**
     * Wrap errors in GitHubClientError
     */
    wrapError(error) {
        if (error instanceof GitHubClientError) {
            return error;
        }
        if (error instanceof ClientError) {
            const status = error.response?.status;
            const message = error.response?.errors?.[0]?.message ?? error.message;
            if (status === 401) {
                return new GitHubClientError('Authentication failed. Check your GitHub token.', 401);
            }
            if (status === 403) {
                return new GitHubClientError('Access denied. Ensure your token has the required scopes.', 403);
            }
            if (status === 429) {
                return new GitHubClientError('Rate limited. Please wait and try again.', 429, true);
            }
            return new GitHubClientError(message, status);
        }
        if (error instanceof Error) {
            return new GitHubClientError(error.message);
        }
        return new GitHubClientError('Unknown error occurred');
    }
    /**
     * Sleep for the specified duration
     */
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
/**
 * Create a GitHub client with the provided token
 */
export function createGitHubClient(token) {
    if (!token) {
        throw new GitHubClientError('GitHub token is required');
    }
    return new GitHubClient({ token });
}
//# sourceMappingURL=client.js.map