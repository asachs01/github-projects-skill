import { SyncState, TaskMapping } from './types.js';
/**
 * Default path for sync state file
 */
export declare const DEFAULT_STATE_PATH = ".taskmaster/sync-state.json";
/**
 * Create an empty sync state
 */
export declare function createEmptySyncState(): SyncState;
/**
 * Read the sync state file
 *
 * @param statePath - Path to the sync state file
 * @returns The sync state, or an empty state if file doesn't exist
 */
export declare function readSyncState(statePath?: string): SyncState;
/**
 * Write the sync state to file
 *
 * @param state - The sync state to write
 * @param statePath - Path to the sync state file
 */
export declare function writeSyncState(state: SyncState, statePath?: string): void;
/**
 * Check if a task has already been synced
 *
 * @param taskId - The Taskmaster task ID
 * @param state - The sync state
 * @returns True if the task has been synced
 */
export declare function isTaskSynced(taskId: string, state: SyncState): boolean;
/**
 * Get the GitHub issue info for a synced task
 *
 * @param taskId - The Taskmaster task ID
 * @param state - The sync state
 * @returns The task mapping if found, undefined otherwise
 */
export declare function getTaskMapping(taskId: string, state: SyncState): TaskMapping | undefined;
/**
 * Add or update a task mapping in the sync state
 *
 * @param state - The current sync state
 * @param mapping - The task mapping to add/update
 * @returns A new sync state with the mapping added
 */
export declare function addTaskMapping(state: SyncState, mapping: TaskMapping): SyncState;
/**
 * Remove a task mapping from the sync state
 *
 * @param state - The current sync state
 * @param taskId - The Taskmaster task ID to remove
 * @returns A new sync state with the mapping removed
 */
export declare function removeTaskMapping(state: SyncState, taskId: string): SyncState;
/**
 * Get all synced task IDs
 *
 * @param state - The sync state
 * @returns Array of task IDs that have been synced
 */
export declare function getSyncedTaskIds(state: SyncState): string[];
/**
 * Get all task mappings as an array
 *
 * @param state - The sync state
 * @returns Array of task mappings
 */
export declare function getAllMappings(state: SyncState): TaskMapping[];
/**
 * Find a mapping by GitHub issue number
 *
 * @param issueNumber - The GitHub issue number
 * @param state - The sync state
 * @returns The task mapping if found, undefined otherwise
 */
export declare function findMappingByIssueNumber(issueNumber: number, state: SyncState): TaskMapping | undefined;
//# sourceMappingURL=state.d.ts.map