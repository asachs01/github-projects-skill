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
  isTaskSynced,
  cleanupStaleEntries,
  acquireLock,
  releaseLock,
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
import {
  determineInitialStatus,
  hasUnresolvedDependencies,
  type InitialStatusOptions,
} from './project-board.js';
import type { NormalizedConfig } from '../types/config.js';

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
  /** Optional: Initial status for issues in the project (overrides auto-detection) */
  initialStatus?: string;
  /** Optional: Organization name for project status lookup */
  org?: string;
  /** Optional: Project number for project status lookup */
  projectNumber?: number;
  /** Optional: Whether the project belongs to an org (default: true) */
  isOrg?: boolean;
  /** Dry run mode - don't actually create issues */
  dryRun?: boolean;
  /**
   * Auto-detect initial status based on task dependencies
   * If true, issues with dependencies go to "Backlog", others to "Ready"
   * Requires config to be provided for status field mapping
   */
  autoDetectStatus?: boolean;
  /** Full config for status field mapping (required if autoDetectStatus is true) */
  config?: NormalizedConfig;
  /**
   * Use file locking for concurrent access safety
   * Enable when multiple processes might sync simultaneously
   */
  useLocking?: boolean;
  /**
   * Clean up stale entries before syncing
   * Removes mappings for tasks that no longer exist
   */
  cleanupStale?: boolean;
  /**
   * Save state after each successful task sync
   * Provides better recovery from partial failures but more I/O
   */
  saveAfterEachTask?: boolean;
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
  /** Initial status set on the project item */
  initialStatus?: string;
  /** Whether the task had unresolved dependencies at sync time */
  hadUnresolvedDependencies?: boolean;
}

/**
 * Extended sync summary with detailed results
 */
export interface ExtendedSyncSummary extends SyncSummary {
  results: TaskSyncResult[];
  /** Number of stale entries cleaned up (if cleanupStale was enabled) */
  staleEntriesRemoved?: number;
  /** Tasks that were skipped due to already being synced (idempotency) */
  skippedDueToDuplicateCheck?: number;
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
    // IDEMPOTENCY CHECK: Double-check the task is not already synced
    // This is a safety net for race conditions or when state is updated between filtering and syncing
    if (isTaskSynced(task.id, currentState)) {
      const existingMapping = currentState.taskMappings[task.id];
      return {
        taskId: task.id,
        success: true,
        issueNumber: existingMapping.githubIssueNumber,
        issueUrl: existingMapping.githubIssueUrl,
        projectItemId: existingMapping.projectItemId,
        // Mark this as a skip due to idempotency
        error: 'SKIPPED_ALREADY_SYNCED',
      };
    }

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
    let initialStatus: string | undefined;
    let hadUnresolvedDeps = false;

    if (syncOptions.projectId) {
      // Determine the initial status
      if (syncOptions.autoDetectStatus && syncOptions.config) {
        // Auto-detect based on dependencies
        const statusOptions: InitialStatusOptions = {
          task,
          syncState: currentState,
          statusMapping: syncOptions.config.statusFieldMapping,
        };
        initialStatus = determineInitialStatus(statusOptions);
        hadUnresolvedDeps = hasUnresolvedDependencies(task, currentState);
      } else if (syncOptions.initialStatus) {
        // Use explicitly provided status
        initialStatus = syncOptions.initialStatus;
      }

      // Create issue and add to project
      const result = await issueService.createIssueInProject(
        mappedIssue.issueInput,
        syncOptions.projectId,
        initialStatus,
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
      initialStatus,
      hadUnresolvedDependencies: hadUnresolvedDeps,
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
 * This function is idempotent - running it multiple times with the same tasks.json
 * will not create duplicate issues. Tasks already in sync-state.json are skipped.
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
    useLocking = false,
    cleanupStale = false,
    saveAfterEachTask = false,
  } = options;

  let lockId: string | undefined;

  try {
    // Acquire lock if requested (for concurrent access safety)
    if (useLocking && !dryRun) {
      lockId = await acquireLock(statePath);
    }

    // Read all tasks
    const allTasks = getAllTasks(tasksPath);

    // Read current sync state
    let syncState = readSyncState(statePath);

    // Initialize summary
    const summary: ExtendedSyncSummary = {
      totalTasks: allTasks.length,
      newlySynced: 0,
      alreadySynced: 0,
      failed: 0,
      results: [],
      skippedDueToDuplicateCheck: 0,
    };

    // Cleanup stale entries if requested
    if (cleanupStale) {
      const cleanupResult = cleanupStaleEntries(allTasks, syncState);
      syncState = cleanupResult.state;
      summary.staleEntriesRemoved = cleanupResult.removedCount;

      if (cleanupResult.removedCount > 0 && !dryRun) {
        writeSyncState(syncState, statePath);
      }
    }

    // Filter out already synced tasks
    const tasksToSync = filterUnsyncedTasks(allTasks, syncState);
    summary.alreadySynced = allTasks.length - tasksToSync.length;

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
        // Check if this was skipped due to idempotency check
        if (result.error === 'SKIPPED_ALREADY_SYNCED') {
          summary.alreadySynced++;
          summary.skippedDueToDuplicateCheck = (summary.skippedDueToDuplicateCheck || 0) + 1;
        } else {
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

            // Save state after each task if requested (for partial failure recovery)
            if (saveAfterEachTask) {
              writeSyncState(syncState, statePath);
            }
          }
        }
      } else {
        summary.failed++;
      }
    }

    // Write updated sync state (if not dry run and not saving after each task)
    if (!dryRun && !saveAfterEachTask && summary.newlySynced > 0) {
      writeSyncState(syncState, statePath);
    }

    return summary;
  } finally {
    // Always release lock
    if (lockId) {
      releaseLock(statePath, lockId);
    }
  }
}

/**
 * Verify sync idempotency by checking if running sync again would create duplicates
 *
 * @param options - Sync options (without token, as this is a read-only check)
 * @returns Object indicating if sync is idempotent and details
 */
export function verifySyncIdempotency(options: Pick<SyncOptions, 'tasksPath' | 'statePath'>): {
  isIdempotent: boolean;
  totalTasks: number;
  syncedTasks: number;
  unsyncedTasks: number;
  unsyncedTaskIds: string[];
} {
  const {
    tasksPath = DEFAULT_TASKS_PATH,
    statePath = DEFAULT_STATE_PATH,
  } = options;

  const allTasks = getAllTasks(tasksPath);
  const syncState = readSyncState(statePath);
  const unsyncedTasks = filterUnsyncedTasks(allTasks, syncState);

  return {
    isIdempotent: unsyncedTasks.length === 0,
    totalTasks: allTasks.length,
    syncedTasks: allTasks.length - unsyncedTasks.length,
    unsyncedTasks: unsyncedTasks.length,
    unsyncedTaskIds: unsyncedTasks.map(t => t.id),
  };
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
