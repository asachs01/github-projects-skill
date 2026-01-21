import * as fs from 'node:fs';
import * as path from 'node:path';
import { SyncState, SyncStateSchema, TaskMapping } from './types.js';

/**
 * Default path for sync state file
 */
export const DEFAULT_STATE_PATH = '.taskmaster/sync-state.json';

/**
 * Create an empty sync state
 */
export function createEmptySyncState(): SyncState {
  return {
    lastSyncAt: undefined,
    taskMappings: {},
    version: '1.0.0',
  };
}

/**
 * Read the sync state file
 *
 * @param statePath - Path to the sync state file
 * @returns The sync state, or an empty state if file doesn't exist
 */
export function readSyncState(statePath: string = DEFAULT_STATE_PATH): SyncState {
  const absolutePath = path.isAbsolute(statePath)
    ? statePath
    : path.resolve(process.cwd(), statePath);

  if (!fs.existsSync(absolutePath)) {
    return createEmptySyncState();
  }

  const content = fs.readFileSync(absolutePath, 'utf-8');

  try {
    const parsed = JSON.parse(content);
    return SyncStateSchema.parse(parsed);
  } catch (error) {
    // If the state file is corrupt, return empty state
    console.warn(`Warning: Could not parse sync state file, starting fresh: ${error instanceof Error ? error.message : String(error)}`);
    return createEmptySyncState();
  }
}

/**
 * Write the sync state to file
 *
 * @param state - The sync state to write
 * @param statePath - Path to the sync state file
 */
export function writeSyncState(state: SyncState, statePath: string = DEFAULT_STATE_PATH): void {
  const absolutePath = path.isAbsolute(statePath)
    ? statePath
    : path.resolve(process.cwd(), statePath);

  // Ensure directory exists
  const dir = path.dirname(absolutePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Update lastSyncAt
  const stateToWrite: SyncState = {
    ...state,
    lastSyncAt: new Date().toISOString(),
  };

  fs.writeFileSync(absolutePath, JSON.stringify(stateToWrite, null, 2), 'utf-8');
}

/**
 * Check if a task has already been synced
 *
 * @param taskId - The Taskmaster task ID
 * @param state - The sync state
 * @returns True if the task has been synced
 */
export function isTaskSynced(taskId: string, state: SyncState): boolean {
  return taskId in state.taskMappings;
}

/**
 * Get the GitHub issue info for a synced task
 *
 * @param taskId - The Taskmaster task ID
 * @param state - The sync state
 * @returns The task mapping if found, undefined otherwise
 */
export function getTaskMapping(taskId: string, state: SyncState): TaskMapping | undefined {
  return state.taskMappings[taskId];
}

/**
 * Add or update a task mapping in the sync state
 *
 * @param state - The current sync state
 * @param mapping - The task mapping to add/update
 * @returns A new sync state with the mapping added
 */
export function addTaskMapping(state: SyncState, mapping: TaskMapping): SyncState {
  return {
    ...state,
    taskMappings: {
      ...state.taskMappings,
      [mapping.taskmasterId]: mapping,
    },
  };
}

/**
 * Remove a task mapping from the sync state
 *
 * @param state - The current sync state
 * @param taskId - The Taskmaster task ID to remove
 * @returns A new sync state with the mapping removed
 */
export function removeTaskMapping(state: SyncState, taskId: string): SyncState {
  const { [taskId]: _, ...remaining } = state.taskMappings;
  return {
    ...state,
    taskMappings: remaining,
  };
}

/**
 * Get all synced task IDs
 *
 * @param state - The sync state
 * @returns Array of task IDs that have been synced
 */
export function getSyncedTaskIds(state: SyncState): string[] {
  return Object.keys(state.taskMappings);
}

/**
 * Get all task mappings as an array
 *
 * @param state - The sync state
 * @returns Array of task mappings
 */
export function getAllMappings(state: SyncState): TaskMapping[] {
  return Object.values(state.taskMappings);
}

/**
 * Find a mapping by GitHub issue number
 *
 * @param issueNumber - The GitHub issue number
 * @param state - The sync state
 * @returns The task mapping if found, undefined otherwise
 */
export function findMappingByIssueNumber(
  issueNumber: number,
  state: SyncState
): TaskMapping | undefined {
  return Object.values(state.taskMappings).find(
    mapping => mapping.githubIssueNumber === issueNumber
  );
}
