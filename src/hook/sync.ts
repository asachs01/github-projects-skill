#!/usr/bin/env node
/**
 * Taskmaster to GitHub Sync
 *
 * This module provides functionality to sync Taskmaster tasks to GitHub issues.
 * It uses the mapper to convert tasks to issue format and the IssueService to create them.
 *
 * Run CLI with: npm run sync-tasks
 */

import { getAllTasks, DEFAULT_TASKS_PATH } from './reader.js';
import {
  readSyncState,
  writeSyncState,
  addTaskMapping,
  DEFAULT_STATE_PATH,
} from './state.js';
import {
  mapTaskToIssue,
  filterUnsyncedTasks,
  type MapperOptions,
  type MappedIssue,
} from './mapper.js';
import type { SyncState, SyncResult, SyncSummary, TaskmasterTask, TaskMapping } from './types.js';
import { createIssueService, IssueService } from '../issues/service.js';
import type { Issue } from '../issues/types.js';

/**
 * Options for the sync operation
 */
export interface SyncOptions {
  /** Path to tasks.json file */
  tasksPath?: string;
  /** Path to sync-state.json file */
  statePath?: string;
  /** GitHub token for API access */
  token: string;
  /** Repository owner (user or org) */
  owner: string;
  /** Repository name */
  repo: string;
  /** Optional: GitHub Project ID to add issues to */
  projectId?: string;
  /** Optional: Initial status for issues in the project */
  initialStatus?: string;
  /** Optional: Organization name for project status lookup */
  org?: string;
  /** Optional: Project number for project status lookup */
  projectNumber?: number;
  /** Optional: Whether the project belongs to an org (default: true) */
  isOrg?: boolean;
  /** Dry run mode - don't actually create issues */
  dryRun?: boolean;
}

/**
 * Result of syncing a single task
 */
export interface TaskSyncResult extends SyncResult {
  /** The mapped issue data (before creation) */
  mappedIssue?: MappedIssue;
  /** The created issue (if successful) */
  createdIssue?: Issue;
  /** Project item ID if added to a project */
  projectItemId?: string;
}

/**
 * Extended sync summary with detailed results
 */
export interface ExtendedSyncSummary extends SyncSummary {
  results: TaskSyncResult[];
}

/**
 * Sync a single task to GitHub
 *
 * @param task - The Taskmaster task to sync
 * @param issueService - The IssueService instance
 * @param mapperOptions - Options for mapping the task
 * @param syncOptions - Full sync options
 * @param currentState - Current sync state (for dependency resolution)
 * @returns The sync result for this task
 */
export async function syncTask(
  task: TaskmasterTask,
  issueService: IssueService,
  mapperOptions: MapperOptions,
  syncOptions: SyncOptions,
  currentState: SyncState
): Promise<TaskSyncResult> {
  try {
    // Map the task to issue format
    const mappedIssue = mapTaskToIssue(task, {
      ...mapperOptions,
      syncState: currentState,
    });

    if (syncOptions.dryRun) {
      return {
        taskId: task.id,
        success: true,
        mappedIssue,
      };
    }

    // Create the issue
    let createdIssue: Issue;
    let projectItemId: string | undefined;

    if (syncOptions.projectId) {
      // Create issue and add to project
      const result = await issueService.createIssueInProject(
        mappedIssue.issueInput,
        syncOptions.projectId,
        syncOptions.initialStatus,
        syncOptions.org,
        syncOptions.projectNumber,
        syncOptions.isOrg
      );
      createdIssue = result.issue;
      projectItemId = result.projectItemId;
    } else {
      // Create issue only
      createdIssue = await issueService.createIssue(mappedIssue.issueInput);
    }

    return {
      taskId: task.id,
      success: true,
      issueNumber: createdIssue.number,
      issueUrl: createdIssue.url,
      mappedIssue,
      createdIssue,
      projectItemId,
    };
  } catch (error) {
    return {
      taskId: task.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Sync all unsynced Taskmaster tasks to GitHub issues
 *
 * @param options - Sync options
 * @returns Summary of the sync operation
 */
export async function syncTasks(options: SyncOptions): Promise<ExtendedSyncSummary> {
  const {
    tasksPath = DEFAULT_TASKS_PATH,
    statePath = DEFAULT_STATE_PATH,
    token,
    owner,
    repo,
    dryRun = false,
  } = options;

  // Read all tasks
  const allTasks = getAllTasks(tasksPath);

  // Read current sync state
  let syncState = readSyncState(statePath);

  // Filter out already synced tasks
  const tasksToSync = filterUnsyncedTasks(allTasks, syncState);

  const summary: ExtendedSyncSummary = {
    totalTasks: allTasks.length,
    newlySynced: 0,
    alreadySynced: allTasks.length - tasksToSync.length,
    failed: 0,
    results: [],
  };

  if (tasksToSync.length === 0) {
    return summary;
  }

  // Create issue service (only if not dry run)
  const issueService = dryRun ? null : createIssueService(token);

  const mapperOptions: MapperOptions = {
    owner,
    repo,
    syncState,
  };

  // Sync each task
  for (const task of tasksToSync) {
    const result = await syncTask(
      task,
      issueService!,
      mapperOptions,
      options,
      syncState
    );

    summary.results.push(result);

    if (result.success) {
      summary.newlySynced++;

      // Update sync state with the new mapping
      if (!dryRun && result.issueNumber && result.issueUrl) {
        const mapping: TaskMapping = {
          taskmasterId: task.id,
          githubIssueNumber: result.issueNumber,
          githubIssueUrl: result.issueUrl,
          projectItemId: result.projectItemId,
          syncedAt: new Date().toISOString(),
        };
        syncState = addTaskMapping(syncState, mapping);

        // Update mapper options with new state for dependency resolution
        mapperOptions.syncState = syncState;
      }
    } else {
      summary.failed++;
    }
  }

  // Write updated sync state (if not dry run)
  if (!dryRun) {
    writeSyncState(syncState, statePath);
  }

  return summary;
}

/**
 * Format a sync summary for console output
 */
export function formatSyncSummary(summary: ExtendedSyncSummary): string {
  const lines: string[] = [];

  lines.push('Sync Summary');
  lines.push('============');
  lines.push(`Total tasks: ${summary.totalTasks}`);
  lines.push(`Already synced: ${summary.alreadySynced}`);
  lines.push(`Newly synced: ${summary.newlySynced}`);
  lines.push(`Failed: ${summary.failed}`);

  if (summary.results.length > 0) {
    lines.push('');
    lines.push('Results:');
    for (const result of summary.results) {
      if (result.success) {
        const issueInfo = result.issueUrl ? ` -> ${result.issueUrl}` : ' (dry run)';
        lines.push(`  [OK] Task #${result.taskId}${issueInfo}`);
      } else {
        lines.push(`  [FAIL] Task #${result.taskId}: ${result.error}`);
      }
    }
  }

  return lines.join('\n');
}

// CLI entry point
async function main(): Promise<void> {
  console.log('Taskmaster to GitHub Sync');
  console.log('=========================\n');

  // Get config from environment
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const projectId = process.env.GITHUB_PROJECT_ID;
  const dryRun = process.env.DRY_RUN === 'true';

  if (!token) {
    console.error('Error: GITHUB_TOKEN environment variable is required');
    process.exit(1);
  }
  if (!owner) {
    console.error('Error: GITHUB_OWNER environment variable is required');
    process.exit(1);
  }
  if (!repo) {
    console.error('Error: GITHUB_REPO environment variable is required');
    process.exit(1);
  }

  if (dryRun) {
    console.log('Running in DRY RUN mode - no issues will be created\n');
  }

  try {
    const summary = await syncTasks({
      token,
      owner,
      repo,
      projectId,
      dryRun,
    });

    console.log('\n' + formatSyncSummary(summary));

    if (summary.failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Only run main if this is the entry point
const isMainModule = process.argv[1]?.endsWith('sync.ts') || process.argv[1]?.endsWith('sync.js');
if (isMainModule) {
  main().catch(console.error);
}
