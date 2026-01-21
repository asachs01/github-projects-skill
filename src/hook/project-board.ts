/**
 * Project Board Integration Module
 *
 * Handles adding issues to GitHub project boards with appropriate initial status
 * based on task dependencies. Issues with no dependencies are set to "Ready",
 * while issues with dependencies are set to "Backlog".
 */

import { GitHubClient, GitHubClientError } from '../github/client.js';
import type { ProjectContext } from '../github/types.js';
import type { NormalizedConfig, NormalizedProjectConfig } from '../types/config.js';
import type { TaskmasterTask, SyncState } from './types.js';

/**
 * Options for adding an issue to a project board
 */
export interface AddToProjectOptions {
  /** GitHub token for API access */
  token: string;
  /** The issue's node ID (from REST API response) */
  issueNodeId: string;
  /** The Taskmaster task (for dependency info) */
  task: TaskmasterTask;
  /** Current sync state (for dependency resolution) */
  syncState: SyncState;
  /** Project configuration */
  projectConfig: NormalizedProjectConfig;
  /** Full normalized config for status mapping */
  config: NormalizedConfig;
  /** Whether the project belongs to an org (default: true) */
  isOrg?: boolean;
}

/**
 * Result of adding an issue to a project board
 */
export interface AddToProjectResult {
  /** The project item ID */
  projectItemId: string;
  /** The initial status that was set */
  initialStatus: string;
  /** The project ID */
  projectId: string;
  /** Whether the task has unresolved dependencies */
  hasUnresolvedDependencies: boolean;
}

/**
 * Options for determining initial status
 */
export interface InitialStatusOptions {
  /** The task to check */
  task: TaskmasterTask;
  /** Current sync state */
  syncState: SyncState;
  /** Status field mapping from config */
  statusMapping: NormalizedConfig['statusFieldMapping'];
}

/**
 * Determine the initial status for an issue based on its dependencies
 *
 * - If the task has no dependencies, status is "Ready"
 * - If the task has dependencies (resolved or not), status is "Backlog"
 *
 * @param options - Options containing task and sync state
 * @returns The status name to use
 */
export function determineInitialStatus(options: InitialStatusOptions): string {
  const { task, statusMapping } = options;

  // If the task has any dependencies, it goes to Backlog
  if (task.dependencies && task.dependencies.length > 0) {
    return statusMapping.backlog;
  }

  // No dependencies means Ready to work on
  return statusMapping.ready;
}

/**
 * Check if a task has unresolved dependencies
 *
 * @param task - The task to check
 * @param syncState - Current sync state
 * @returns True if any dependencies are not yet synced
 */
export function hasUnresolvedDependencies(
  task: TaskmasterTask,
  syncState: SyncState
): boolean {
  if (!task.dependencies || task.dependencies.length === 0) {
    return false;
  }

  return task.dependencies.some(
    (depId) => !(depId in syncState.taskMappings)
  );
}

/**
 * Get the project context for a project configuration
 *
 * @param client - The GitHub client
 * @param projectConfig - The project configuration
 * @param isOrg - Whether the project belongs to an org
 * @returns The project context with field IDs and status options
 */
export async function getProjectContext(
  client: GitHubClient,
  projectConfig: NormalizedProjectConfig,
  isOrg: boolean = true
): Promise<ProjectContext> {
  return client.getProject(
    projectConfig.org,
    projectConfig.projectNumber,
    isOrg
  );
}

/**
 * Find the status option ID for a given status name
 *
 * @param projectContext - The project context
 * @param statusName - The status name to find
 * @returns The option ID, or undefined if not found
 */
export function findStatusOptionId(
  projectContext: ProjectContext,
  statusName: string
): string | undefined {
  // Status options are stored lowercase in the map
  return projectContext.statusOptions.get(statusName.toLowerCase());
}

/**
 * Validate that a status exists in the project
 *
 * @param projectContext - The project context
 * @param statusName - The status name to validate
 * @throws GitHubClientError if status not found
 */
export function validateStatus(
  projectContext: ProjectContext,
  statusName: string
): void {
  const optionId = findStatusOptionId(projectContext, statusName);
  if (!optionId) {
    const availableStatuses = Array.from(projectContext.statusOptions.keys());
    throw new GitHubClientError(
      `Status "${statusName}" not found in project. Available statuses: ${availableStatuses.join(', ')}`
    );
  }
}

/**
 * Add an issue to a project board with the appropriate initial status
 *
 * This is the main entry point for project board integration.
 * It handles:
 * 1. Adding the issue to the project using GraphQL
 * 2. Determining the initial status based on dependencies
 * 3. Setting the status on the project item
 *
 * @param options - Options for adding the issue to the project
 * @returns Result containing project item ID and status set
 */
export async function addIssueToProjectBoard(
  options: AddToProjectOptions
): Promise<AddToProjectResult> {
  const {
    token,
    issueNodeId,
    task,
    syncState,
    projectConfig,
    config,
    isOrg = true,
  } = options;

  // Create GitHub client
  const client = new GitHubClient({ token });

  // Get project context for field IDs and status options
  const projectContext = await getProjectContext(client, projectConfig, isOrg);

  // Add the issue to the project
  const projectItemId = await client.addItemToProject(
    projectContext.projectId,
    issueNodeId
  );

  // Determine the initial status based on dependencies
  const initialStatus = determineInitialStatus({
    task,
    syncState,
    statusMapping: config.statusFieldMapping,
  });

  // Validate that the status exists in the project
  validateStatus(projectContext, initialStatus);

  // Get the option ID for the status
  const optionId = findStatusOptionId(projectContext, initialStatus);
  if (!optionId) {
    // This shouldn't happen after validation, but TypeScript needs it
    throw new GitHubClientError(`Status option ID not found for "${initialStatus}"`);
  }

  // Set the initial status
  await client.updateItemStatus(
    projectContext.projectId,
    projectItemId,
    projectContext.statusFieldId,
    optionId
  );

  return {
    projectItemId,
    initialStatus,
    projectId: projectContext.projectId,
    hasUnresolvedDependencies: hasUnresolvedDependencies(task, syncState),
  };
}

/**
 * Select the appropriate project for a repository
 *
 * Given a repository (owner/repo format) and a config, find the project
 * that should contain issues from that repository.
 *
 * @param repoFullName - Repository in "owner/repo" format
 * @param config - The normalized configuration
 * @returns The matching project config, or undefined if no match
 */
export function selectProjectForRepo(
  repoFullName: string,
  config: NormalizedConfig
): NormalizedProjectConfig | undefined {
  // Find a project that includes this repo
  return config.projects.find((project) =>
    project.repos.some((repo) => repo.toLowerCase() === repoFullName.toLowerCase())
  );
}

/**
 * Batch add multiple issues to a project board
 *
 * Useful when syncing multiple tasks at once. Each issue is added
 * with its own appropriate status based on dependencies.
 *
 * @param options - Base options (without task-specific data)
 * @param issues - Array of issues with their tasks
 * @returns Array of results for each issue
 */
export interface BatchAddOptions {
  token: string;
  projectConfig: NormalizedProjectConfig;
  config: NormalizedConfig;
  isOrg?: boolean;
}

export interface BatchIssueInput {
  issueNodeId: string;
  task: TaskmasterTask;
}

export async function batchAddIssuesToProjectBoard(
  options: BatchAddOptions,
  issues: BatchIssueInput[],
  syncState: SyncState
): Promise<Array<AddToProjectResult | { error: string; issueNodeId: string }>> {
  const results: Array<AddToProjectResult | { error: string; issueNodeId: string }> = [];

  // Process sequentially to avoid rate limiting
  for (const issue of issues) {
    try {
      const result = await addIssueToProjectBoard({
        ...options,
        issueNodeId: issue.issueNodeId,
        task: issue.task,
        syncState,
      });
      results.push(result);
    } catch (error) {
      results.push({
        error: error instanceof Error ? error.message : String(error),
        issueNodeId: issue.issueNodeId,
      });
    }
  }

  return results;
}
