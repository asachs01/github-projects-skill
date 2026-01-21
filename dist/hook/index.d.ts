/**
 * Taskmaster Hook Module
 *
 * This module provides functionality to sync Taskmaster tasks to GitHub Projects.
 * It reads tasks from Taskmaster's tasks.json, tracks sync state, and provides
 * utilities for mapping between Taskmaster tasks and GitHub issues.
 */
export { TaskmasterTask, TaskmasterTaskSchema, TasksFile, TasksFileSchema, TaskMapping, SyncState, SyncStateSchema, SyncResult, SyncSummary, } from './types.js';
export { DEFAULT_TASKS_PATH, readTasksFile, getAllTasks, getTasksByStatus, getTaskById, getTasksToSync, getPendingTasks, getInProgressTasks, getDoneTasks, } from './reader.js';
export { DEFAULT_STATE_PATH, createEmptySyncState, readSyncState, writeSyncState, isTaskSynced, getTaskMapping, addTaskMapping, removeTaskMapping, getSyncedTaskIds, getAllMappings, findMappingByIssueNumber, } from './state.js';
export { mapPriorityToLabel, formatIssueBody, resolveDependencies, mapTaskToIssue, mapTasksToIssues, filterUnsyncedTasks, type MapperOptions, type MappedIssue, } from './mapper.js';
export { syncTask, syncTasks, formatSyncSummary, type SyncOptions, type TaskSyncResult, type ExtendedSyncSummary, } from './sync.js';
//# sourceMappingURL=index.d.ts.map