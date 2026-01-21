import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { SyncState, SyncStateSchema, TaskMapping, TaskmasterTask } from './types.js';

/**
 * Default path for sync state file
 */
export const DEFAULT_STATE_PATH = '.taskmaster/sync-state.json';

/**
 * Lock file extension
 */
const LOCK_EXTENSION = '.lock';

/**
 * Maximum lock wait time in milliseconds
 */
const MAX_LOCK_WAIT_MS = 30000;

/**
 * Lock file retry interval in milliseconds
 */
const LOCK_RETRY_INTERVAL_MS = 100;

/**
 * Stale lock threshold in milliseconds (5 minutes)
 */
const STALE_LOCK_THRESHOLD_MS = 5 * 60 * 1000;

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
 * Get the lock file path for a state file
 */
function getLockPath(statePath: string): string {
  return statePath + LOCK_EXTENSION;
}

/**
 * Check if a lock file is stale (older than threshold)
 */
function isLockStale(lockPath: string): boolean {
  try {
    const stats = fs.statSync(lockPath);
    const age = Date.now() - stats.mtimeMs;
    return age > STALE_LOCK_THRESHOLD_MS;
  } catch {
    return true; // If we can't stat it, consider it stale
  }
}

/**
 * Acquire a lock for the state file
 * Uses exclusive file creation to ensure atomicity
 *
 * @param statePath - Path to the state file
 * @returns The lock ID (for releasing)
 * @throws Error if lock cannot be acquired within timeout
 */
export async function acquireLock(statePath: string): Promise<string> {
  const absolutePath = path.isAbsolute(statePath)
    ? statePath
    : path.resolve(process.cwd(), statePath);
  const lockPath = getLockPath(absolutePath);
  const lockId = crypto.randomUUID();
  const startTime = Date.now();

  // Ensure directory exists
  const dir = path.dirname(lockPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  while (true) {
    try {
      // Try to create lock file exclusively
      fs.writeFileSync(lockPath, JSON.stringify({
        id: lockId,
        pid: process.pid,
        timestamp: new Date().toISOString(),
      }), { flag: 'wx' });
      return lockId;
    } catch (error) {
      // Check if lock exists
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        // Check if lock is stale
        if (isLockStale(lockPath)) {
          try {
            fs.unlinkSync(lockPath);
            continue; // Retry after removing stale lock
          } catch {
            // Another process might have removed it, continue
          }
        }

        // Check timeout
        if (Date.now() - startTime > MAX_LOCK_WAIT_MS) {
          throw new Error(`Failed to acquire lock for ${statePath}: timeout after ${MAX_LOCK_WAIT_MS}ms`);
        }

        // Wait and retry
        await new Promise(resolve => setTimeout(resolve, LOCK_RETRY_INTERVAL_MS));
      } else {
        throw error;
      }
    }
  }
}

/**
 * Release a lock for the state file
 *
 * @param statePath - Path to the state file
 * @param lockId - The lock ID from acquireLock (optional, for verification)
 */
export function releaseLock(statePath: string, lockId?: string): void {
  const absolutePath = path.isAbsolute(statePath)
    ? statePath
    : path.resolve(process.cwd(), statePath);
  const lockPath = getLockPath(absolutePath);

  try {
    if (lockId) {
      // Verify we own the lock before releasing
      const lockContent = fs.readFileSync(lockPath, 'utf-8');
      const lockData = JSON.parse(lockContent);
      if (lockData.id !== lockId) {
        console.warn(`Lock ID mismatch: expected ${lockId}, got ${lockData.id}`);
        return;
      }
    }
    fs.unlinkSync(lockPath);
  } catch {
    // Lock might already be released or never existed
  }
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
 * Write the sync state to file using atomic write (temp file + rename)
 * This prevents corruption from partial writes or crashes
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

  // Atomic write: write to temp file first, then rename
  const tempPath = `${absolutePath}.${crypto.randomUUID()}.tmp`;

  try {
    fs.writeFileSync(tempPath, JSON.stringify(stateToWrite, null, 2), 'utf-8');
    fs.renameSync(tempPath, absolutePath);
  } catch (error) {
    // Clean up temp file on failure
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Write the sync state to file with locking for concurrent access
 * Use this when multiple processes might be writing to the state file
 *
 * @param state - The sync state to write
 * @param statePath - Path to the sync state file
 */
export async function writeSyncStateWithLock(
  state: SyncState,
  statePath: string = DEFAULT_STATE_PATH
): Promise<void> {
  const lockId = await acquireLock(statePath);
  try {
    writeSyncState(state, statePath);
  } finally {
    releaseLock(statePath, lockId);
  }
}

/**
 * Read and update sync state atomically with locking
 * Prevents race conditions when multiple processes update state
 *
 * @param statePath - Path to the sync state file
 * @param updater - Function that receives current state and returns new state
 */
export async function updateSyncStateWithLock(
  statePath: string,
  updater: (current: SyncState) => SyncState
): Promise<SyncState> {
  const lockId = await acquireLock(statePath);
  try {
    const currentState = readSyncState(statePath);
    const newState = updater(currentState);
    writeSyncState(newState, statePath);
    return newState;
  } finally {
    releaseLock(statePath, lockId);
  }
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

// ============================================================================
// Convenience Wrapper Functions
// These provide a simpler API for common operations
// ============================================================================

/**
 * Check if a task has already been synced (convenience wrapper)
 * Reads the current state from file
 *
 * @param taskId - The Taskmaster task ID
 * @param statePath - Path to the sync state file
 * @returns True if the task has been synced
 */
export function isSynced(taskId: string, statePath: string = DEFAULT_STATE_PATH): boolean {
  const state = readSyncState(statePath);
  return isTaskSynced(taskId, state);
}

/**
 * Mark a task as synced (convenience wrapper)
 * Reads current state, adds mapping, and writes back
 *
 * @param taskId - The Taskmaster task ID
 * @param issueNumber - The GitHub issue number
 * @param url - The GitHub issue URL
 * @param projectItemId - Optional project item ID
 * @param statePath - Path to the sync state file
 */
export function markSynced(
  taskId: string,
  issueNumber: number,
  url: string,
  projectItemId?: string,
  statePath: string = DEFAULT_STATE_PATH
): void {
  const state = readSyncState(statePath);
  const mapping: TaskMapping = {
    taskmasterId: taskId,
    githubIssueNumber: issueNumber,
    githubIssueUrl: url,
    projectItemId,
    syncedAt: new Date().toISOString(),
  };
  const newState = addTaskMapping(state, mapping);
  writeSyncState(newState, statePath);
}

/**
 * Mark a task as synced with locking (for concurrent access)
 *
 * @param taskId - The Taskmaster task ID
 * @param issueNumber - The GitHub issue number
 * @param url - The GitHub issue URL
 * @param projectItemId - Optional project item ID
 * @param statePath - Path to the sync state file
 */
export async function markSyncedWithLock(
  taskId: string,
  issueNumber: number,
  url: string,
  projectItemId?: string,
  statePath: string = DEFAULT_STATE_PATH
): Promise<void> {
  await updateSyncStateWithLock(statePath, (current) => {
    const mapping: TaskMapping = {
      taskmasterId: taskId,
      githubIssueNumber: issueNumber,
      githubIssueUrl: url,
      projectItemId,
      syncedAt: new Date().toISOString(),
    };
    return addTaskMapping(current, mapping);
  });
}

/**
 * Get the GitHub mapping for a task (convenience wrapper)
 * Reads the current state from file
 *
 * @param taskId - The Taskmaster task ID
 * @param statePath - Path to the sync state file
 * @returns The task mapping if found, undefined otherwise
 */
export function getMapping(taskId: string, statePath: string = DEFAULT_STATE_PATH): TaskMapping | undefined {
  const state = readSyncState(statePath);
  return getTaskMapping(taskId, state);
}

// ============================================================================
// Cleanup and Maintenance Functions
// ============================================================================

/**
 * Clean up stale entries from the sync state
 * Removes mappings for tasks that no longer exist in the tasks list
 *
 * @param currentTasks - Array of current Taskmaster tasks
 * @param state - The sync state to clean
 * @returns A new sync state with stale entries removed and count of removed entries
 */
export function cleanupStaleEntries(
  currentTasks: TaskmasterTask[],
  state: SyncState
): { state: SyncState; removedCount: number } {
  const currentTaskIds = new Set(currentTasks.map(t => t.id));
  const staleIds: string[] = [];

  // Find task IDs in state that are not in current tasks
  for (const taskId of Object.keys(state.taskMappings)) {
    if (!currentTaskIds.has(taskId)) {
      staleIds.push(taskId);
    }
  }

  // Remove stale entries
  let newState = state;
  for (const taskId of staleIds) {
    newState = removeTaskMapping(newState, taskId);
  }

  return {
    state: newState,
    removedCount: staleIds.length,
  };
}

/**
 * Clean up stale entries with file I/O (convenience wrapper)
 * Reads current state, removes stale entries, and writes back
 *
 * @param currentTasks - Array of current Taskmaster tasks
 * @param statePath - Path to the sync state file
 * @returns Number of entries removed
 */
export function cleanupStaleEntriesFromFile(
  currentTasks: TaskmasterTask[],
  statePath: string = DEFAULT_STATE_PATH
): number {
  const state = readSyncState(statePath);
  const { state: newState, removedCount } = cleanupStaleEntries(currentTasks, state);

  if (removedCount > 0) {
    writeSyncState(newState, statePath);
  }

  return removedCount;
}

/**
 * Clean up stale entries with locking (for concurrent access)
 *
 * @param currentTasks - Array of current Taskmaster tasks
 * @param statePath - Path to the sync state file
 * @returns Number of entries removed
 */
export async function cleanupStaleEntriesWithLock(
  currentTasks: TaskmasterTask[],
  statePath: string = DEFAULT_STATE_PATH
): Promise<number> {
  let removedCount = 0;

  await updateSyncStateWithLock(statePath, (current) => {
    const result = cleanupStaleEntries(currentTasks, current);
    removedCount = result.removedCount;
    return result.state;
  });

  return removedCount;
}

/**
 * Verify state integrity - check for orphaned or inconsistent entries
 *
 * @param state - The sync state to verify
 * @returns Object with validation results
 */
export function verifyStateIntegrity(state: SyncState): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check each mapping for required fields
  for (const [taskId, mapping] of Object.entries(state.taskMappings)) {
    if (mapping.taskmasterId !== taskId) {
      issues.push(`Mapping key '${taskId}' does not match taskmasterId '${mapping.taskmasterId}'`);
    }
    if (!mapping.githubIssueNumber || mapping.githubIssueNumber <= 0) {
      issues.push(`Invalid issue number for task '${taskId}': ${mapping.githubIssueNumber}`);
    }
    if (!mapping.githubIssueUrl || !mapping.githubIssueUrl.startsWith('http')) {
      issues.push(`Invalid issue URL for task '${taskId}': ${mapping.githubIssueUrl}`);
    }
    if (!mapping.syncedAt) {
      issues.push(`Missing syncedAt for task '${taskId}'`);
    }
  }

  // Check for duplicate issue numbers
  const issueNumbers = new Map<number, string>();
  for (const [taskId, mapping] of Object.entries(state.taskMappings)) {
    const existingTaskId = issueNumbers.get(mapping.githubIssueNumber);
    if (existingTaskId) {
      issues.push(`Duplicate issue number ${mapping.githubIssueNumber} for tasks '${existingTaskId}' and '${taskId}'`);
    } else {
      issueNumbers.set(mapping.githubIssueNumber, taskId);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
