#!/usr/bin/env node
/**
 * Taskmaster to GitHub Sync
 *
 * This module provides functionality to sync Taskmaster tasks to GitHub issues.
 * It uses the mapper to convert tasks to issue format and the IssueService to create them.
 *
 * Run CLI with: npm run sync-tasks
 */
import { type MapperOptions, type MappedIssue } from './mapper.js';
import type { SyncState, SyncResult, SyncSummary, TaskmasterTask } from './types.js';
import { IssueService } from '../issues/service.js';
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
export declare function syncTask(task: TaskmasterTask, issueService: IssueService, mapperOptions: MapperOptions, syncOptions: SyncOptions, currentState: SyncState): Promise<TaskSyncResult>;
/**
 * Sync all unsynced Taskmaster tasks to GitHub issues
 *
 * @param options - Sync options
 * @returns Summary of the sync operation
 */
export declare function syncTasks(options: SyncOptions): Promise<ExtendedSyncSummary>;
/**
 * Format a sync summary for console output
 */
export declare function formatSyncSummary(summary: ExtendedSyncSummary): string;
//# sourceMappingURL=sync.d.ts.map