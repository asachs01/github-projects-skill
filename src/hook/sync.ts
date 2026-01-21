#!/usr/bin/env node
/**
 * Taskmaster to GitHub Sync CLI
 *
 * This script syncs Taskmaster tasks to GitHub issues and project boards.
 * Run with: npm run sync-tasks
 */

import { readTasksFile, getAllTasks, DEFAULT_TASKS_PATH } from './reader.js';
import { readSyncState, writeSyncState, isTaskSynced, DEFAULT_STATE_PATH } from './state.js';
import type { SyncSummary } from './types.js';

async function main(): Promise<void> {
  console.log('Taskmaster to GitHub Sync');
  console.log('=========================\n');

  // Read tasks
  console.log(`Reading tasks from: ${DEFAULT_TASKS_PATH}`);
  try {
    const tasksFile = readTasksFile();
    const tasks = getAllTasks();
    console.log(`Found ${tasks.length} tasks\n`);

    // Read sync state
    console.log(`Reading sync state from: ${DEFAULT_STATE_PATH}`);
    const state = readSyncState();
    const syncedCount = Object.keys(state.taskMappings).length;
    console.log(`Already synced: ${syncedCount} tasks\n`);

    // Determine what needs syncing
    const tasksToSync = tasks.filter(task => !isTaskSynced(task.id, state));
    console.log(`Tasks needing sync: ${tasksToSync.length}`);

    if (tasksToSync.length === 0) {
      console.log('\nAll tasks are already synced!');
      return;
    }

    // List tasks that would be synced
    console.log('\nTasks to sync:');
    for (const task of tasksToSync) {
      console.log(`  - [${task.id}] ${task.title} (${task.status})`);
    }

    // Note: Actual sync implementation will be added in Task #12
    console.log('\nNote: Actual GitHub sync not yet implemented.');
    console.log('This will be added in Task #12 (Implement Taskmaster Tasks to GitHub Issues Mapping)');

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch(console.error);
