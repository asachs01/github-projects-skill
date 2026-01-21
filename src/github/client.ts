import { GraphQLClient, ClientError } from 'graphql-request';
import type {
  ProjectV2,
  ProjectItem,
  ProjectContext,
  ProjectSingleSelectField,
  GetUserProjectResponse,
  GetOrgProjectResponse,
  GetProjectItemsResponse,
  AddProjectItemResponse,
  UpdateProjectItemFieldResponse,
} from './types.js';
import {
  GET_USER_PROJECT,
  GET_ORG_PROJECT,
  GET_PROJECT_ITEMS,
  ADD_PROJECT_ITEM,
  UPDATE_PROJECT_ITEM_FIELD,
} from './queries.js';

const GITHUB_GRAPHQL_ENDPOINT = 'https://api.github.com/graphql';
const GITHUB_REST_ENDPOINT = 'https://api.github.com';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export interface GitHubClientOptions {
  token: string;
}

export class GitHubClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly isRetryable: boolean = false
  ) {
    super(message);
    this.name = 'GitHubClientError';
  }
}

/**
 * GitHub GraphQL client with authentication and caching
 */
export class GitHubClient {
  private client: GraphQLClient;
  private token: string;
  private projectCache: Map<string, ProjectContext> = new Map();

  constructor(options: GitHubClientOptions) {
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
  async validateToken(): Promise<{ login: string; scopes: string[] }> {
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
    const user = await response.json() as { login: string };

    // Verify required scopes
    const requiredScopes = ['repo', 'project'];
    const missingScopes = requiredScopes.filter((s) => !scopes.some((scope) => scope.includes(s)));

    if (missingScopes.length > 0) {
      throw new GitHubClientError(
        `Token missing required scopes: ${missingScopes.join(', ')}. ` +
        `Current scopes: ${scopes.join(', ')}`
      );
    }

    return { login: user.login, scopes };
  }

  /**
   * Get a project by org/user and number, with caching
   */
  async getProject(org: string, projectNumber: number, isOrg: boolean = true): Promise<ProjectContext> {
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
  private async fetchProject(org: string, projectNumber: number, isOrg: boolean): Promise<ProjectV2> {
    const query = isOrg ? GET_ORG_PROJECT : GET_USER_PROJECT;
    const variables = { login: org, number: projectNumber };

    const response = await this.executeWithRetry<GetUserProjectResponse | GetOrgProjectResponse>(
      query,
      variables
    );

    const project = isOrg
      ? (response as GetOrgProjectResponse).organization?.projectV2
      : (response as GetUserProjectResponse).user?.projectV2;

    if (!project) {
      // Try the other type (user vs org)
      const altQuery = isOrg ? GET_USER_PROJECT : GET_ORG_PROJECT;
      const altResponse = await this.executeWithRetry<GetUserProjectResponse | GetOrgProjectResponse>(
        altQuery,
        variables
      );

      const altProject = isOrg
        ? (altResponse as GetUserProjectResponse).user?.projectV2
        : (altResponse as GetOrgProjectResponse).organization?.projectV2;

      if (!altProject) {
        throw new GitHubClientError(
          `Project #${projectNumber} not found for ${org}. ` +
          `Ensure the project exists and your token has access.`
        );
      }

      return altProject;
    }

    return project;
  }

  /**
   * Build project context from API response
   */
  private buildProjectContext(project: ProjectV2): ProjectContext {
    // Find the Status field
    const statusField = project.fields?.nodes.find(
      (f): f is ProjectSingleSelectField => f.name === 'Status' && 'options' in f
    );

    if (!statusField) {
      throw new GitHubClientError(
        `No Status field found in project "${project.title}". ` +
        `GitHub Projects v2 must have a Status field.`
      );
    }

    // Build status options map
    const statusOptions = new Map<string, string>();
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
  async getProjectItems(projectId: string): Promise<ProjectItem[]> {
    const allItems: ProjectItem[] = [];
    let cursor: string | undefined = undefined;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const response: GetProjectItemsResponse = await this.executeWithRetry<GetProjectItemsResponse>(
        GET_PROJECT_ITEMS,
        { projectId, first: 100, after: cursor }
      );

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
  async addItemToProject(projectId: string, contentId: string): Promise<string> {
    const response = await this.executeWithRetry<AddProjectItemResponse>(
      ADD_PROJECT_ITEM,
      { projectId, contentId }
    );

    return response.addProjectV2ItemById.item.id;
  }

  /**
   * Update the status of a project item
   */
  async updateItemStatus(
    projectId: string,
    itemId: string,
    fieldId: string,
    optionId: string
  ): Promise<void> {
    await this.executeWithRetry<UpdateProjectItemFieldResponse>(
      UPDATE_PROJECT_ITEM_FIELD,
      { projectId, itemId, fieldId, singleSelectOptionId: optionId }
    );
  }

  /**
   * Clear the project cache
   */
  clearCache(): void {
    this.projectCache.clear();
  }

  /**
   * Execute a GraphQL query with retry logic
   */
  private async executeWithRetry<T>(
    query: string,
    variables: Record<string, unknown>
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await this.client.request<T>(query, variables);
      } catch (error) {
        lastError = error as Error;

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
  private isRetryableError(error: unknown): boolean {
    if (error instanceof ClientError) {
      const status = error.response?.status;
      return status === 502 || status === 503 || status === 429;
    }
    return false;
  }

  /**
   * Wrap errors in GitHubClientError
   */
  private wrapError(error: unknown): GitHubClientError {
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
        return new GitHubClientError(
          'Access denied. Ensure your token has the required scopes.',
          403
        );
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
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a GitHub client with the provided token
 */
export function createGitHubClient(token: string): GitHubClient {
  if (!token) {
    throw new GitHubClientError('GitHub token is required');
  }
  return new GitHubClient({ token });
}
