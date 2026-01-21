/**
 * Taskmaster Hook Module
 *
 * This module provides functionality to sync Taskmaster tasks to GitHub Projects.
 * It reads tasks from Taskmaster's tasks.json, tracks sync state, and provides
 * utilities for mapping between Taskmaster tasks and GitHub issues.
 */
// Types
export { TaskmasterTaskSchema, TasksFileSchema, SyncStateSchema, } from './types.js';
// Task Reader
export { DEFAULT_TASKS_PATH, readTasksFile, getAllTasks, getTasksByStatus, getTaskById, getTasksToSync, getPendingTasks, getInProgressTasks, getDoneTasks, } from './reader.js';
// Sync State Management
export { DEFAULT_STATE_PATH, createEmptySyncState, readSyncState, writeSyncState, isTaskSynced, getTaskMapping, addTaskMapping, removeTaskMapping, getSyncedTaskIds, getAllMappings, findMappingByIssueNumber, } from './state.js';
// Task to Issue Mapper
export { mapPriorityToLabel, formatIssueBody, resolveDependencies, mapTaskToIssue, mapTasksToIssues, filterUnsyncedTasks, } from './mapper.js';
// Sync Operations
export { syncTask, syncTasks, formatSyncSummary, } from './sync.js';
//# sourceMappingURL=index.js.map