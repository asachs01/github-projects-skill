import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  // Types
  TaskmasterTaskSchema,
  TasksFileSchema,
  SyncStateSchema,
  type TaskmasterTask,
  type SyncState,
  // Reader functions
  readTasksFile,
  getAllTasks,
  getTasksByStatus,
  getTaskById,
  getPendingTasks,
  getInProgressTasks,
  getDoneTasks,
  // State functions
  createEmptySyncState,
  readSyncState,
  writeSyncState,
  writeSyncStateWithLock,
  updateSyncStateWithLock,
  isTaskSynced,
  getTaskMapping,
  addTaskMapping,
  removeTaskMapping,
  getSyncedTaskIds,
  getAllMappings,
  findMappingByIssueNumber,
  // Convenience wrappers
  isSynced,
  markSynced,
  getMapping,
  // Lock management
  acquireLock,
  releaseLock,
  // Cleanup functions
  cleanupStaleEntries,
  cleanupStaleEntriesFromFile,
  verifyStateIntegrity,
  // Sync functions
  verifySyncIdempotency,
  filterUnsyncedTasks,
} from '../hook/index.js';

// Sample task data matching the actual tasks.json format
const sampleTask: TaskmasterTask = {
  id: '1',
  title: 'Test Task',
  description: 'A test task description',
  details: 'Detailed information about the task',
  testStrategy: 'Unit tests for the task',
  priority: 'high',
  dependencies: [],
  status: 'pending',
  subtasks: [],
  updatedAt: '2026-01-21T20:00:00.000Z',
};

const sampleTasksFile = {
  master: {
    tasks: [
      sampleTask,
      {
        id: '2',
        title: 'In Progress Task',
        description: 'Currently being worked on',
        priority: 'medium',
        dependencies: ['1'],
        status: 'in-progress',
        subtasks: [],
      },
      {
        id: '3',
        title: 'Done Task',
        description: 'Already completed',
        priority: 'low',
        dependencies: [],
        status: 'done',
        subtasks: [],
      },
    ],
    metadata: {
      version: '1.0.0',
      lastModified: '2026-01-21T20:00:00.000Z',
      taskCount: 3,
      completedCount: 1,
      tags: ['master'],
    },
  },
};

describe('Hook Types', () => {
  describe('TaskmasterTaskSchema', () => {
    it('validates a valid task', () => {
      const result = TaskmasterTaskSchema.safeParse(sampleTask);
      expect(result.success).toBe(true);
    });

    it('validates task with minimal fields', () => {
      const minimalTask = {
        id: '1',
        title: 'Test',
        description: 'Desc',
        priority: 'high',
        status: 'pending',
      };
      const result = TaskmasterTaskSchema.safeParse(minimalTask);
      expect(result.success).toBe(true);
    });

    it('rejects task with invalid priority', () => {
      const invalidTask = { ...sampleTask, priority: 'invalid' };
      const result = TaskmasterTaskSchema.safeParse(invalidTask);
      expect(result.success).toBe(false);
    });

    it('rejects task with invalid status', () => {
      const invalidTask = { ...sampleTask, status: 'invalid' };
      const result = TaskmasterTaskSchema.safeParse(invalidTask);
      expect(result.success).toBe(false);
    });
  });

  describe('TasksFileSchema', () => {
    it('validates a valid tasks file', () => {
      const result = TasksFileSchema.safeParse(sampleTasksFile);
      expect(result.success).toBe(true);
    });
  });

  describe('SyncStateSchema', () => {
    it('validates an empty sync state', () => {
      const emptyState = {
        taskMappings: {},
        version: '1.0.0',
      };
      const result = SyncStateSchema.safeParse(emptyState);
      expect(result.success).toBe(true);
    });

    it('validates sync state with mappings', () => {
      const stateWithMappings = {
        lastSyncAt: '2026-01-21T20:00:00.000Z',
        taskMappings: {
          '1': {
            taskmasterId: '1',
            githubIssueNumber: 42,
            githubIssueUrl: 'https://github.com/org/repo/issues/42',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
        },
        version: '1.0.0',
      };
      const result = SyncStateSchema.safeParse(stateWithMappings);
      expect(result.success).toBe(true);
    });
  });
});

describe('Hook Reader', () => {
  let tempDir: string;
  let tasksFilePath: string;

  beforeEach(() => {
    // Create a temp directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-'));
    tasksFilePath = path.join(tempDir, 'tasks.json');
    fs.writeFileSync(tasksFilePath, JSON.stringify(sampleTasksFile, null, 2));
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('readTasksFile', () => {
    it('reads and parses a valid tasks file', () => {
      const result = readTasksFile(tasksFilePath);
      expect(result.master.tasks).toHaveLength(3);
    });

    it('throws when file does not exist', () => {
      expect(() => readTasksFile('/nonexistent/path.json')).toThrow('Tasks file not found');
    });

    it('throws on invalid JSON', () => {
      fs.writeFileSync(tasksFilePath, 'not valid json');
      expect(() => readTasksFile(tasksFilePath)).toThrow('Invalid JSON');
    });

    it('throws on invalid task format', () => {
      fs.writeFileSync(tasksFilePath, JSON.stringify({ master: { tasks: [{ invalid: true }] } }));
      expect(() => readTasksFile(tasksFilePath)).toThrow();
    });
  });

  describe('getAllTasks', () => {
    it('returns all tasks from the file', () => {
      const tasks = getAllTasks(tasksFilePath);
      expect(tasks).toHaveLength(3);
      expect(tasks[0].title).toBe('Test Task');
    });
  });

  describe('getTasksByStatus', () => {
    it('returns tasks filtered by status', () => {
      const pendingTasks = getTasksByStatus('pending', tasksFilePath);
      expect(pendingTasks).toHaveLength(1);
      expect(pendingTasks[0].id).toBe('1');
    });
  });

  describe('getTaskById', () => {
    it('returns task by ID', () => {
      const task = getTaskById('2', tasksFilePath);
      expect(task).toBeDefined();
      expect(task?.title).toBe('In Progress Task');
    });

    it('returns undefined for unknown ID', () => {
      const task = getTaskById('999', tasksFilePath);
      expect(task).toBeUndefined();
    });
  });

  describe('getPendingTasks', () => {
    it('returns only pending tasks', () => {
      const tasks = getPendingTasks(tasksFilePath);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].status).toBe('pending');
    });
  });

  describe('getInProgressTasks', () => {
    it('returns only in-progress tasks', () => {
      const tasks = getInProgressTasks(tasksFilePath);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].status).toBe('in-progress');
    });
  });

  describe('getDoneTasks', () => {
    it('returns only done tasks', () => {
      const tasks = getDoneTasks(tasksFilePath);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].status).toBe('done');
    });
  });
});

describe('Hook State', () => {
  let tempDir: string;
  let stateFilePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-state-test-'));
    stateFilePath = path.join(tempDir, 'sync-state.json');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('createEmptySyncState', () => {
    it('creates an empty sync state', () => {
      const state = createEmptySyncState();
      expect(state.taskMappings).toEqual({});
      expect(state.version).toBe('1.0.0');
      expect(state.lastSyncAt).toBeUndefined();
    });
  });

  describe('readSyncState', () => {
    it('returns empty state when file does not exist', () => {
      const state = readSyncState(stateFilePath);
      expect(state.taskMappings).toEqual({});
    });

    it('reads existing state file', () => {
      const existingState: SyncState = {
        lastSyncAt: '2026-01-21T20:00:00.000Z',
        taskMappings: {
          '1': {
            taskmasterId: '1',
            githubIssueNumber: 42,
            githubIssueUrl: 'https://github.com/org/repo/issues/42',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
        },
        version: '1.0.0',
      };
      fs.writeFileSync(stateFilePath, JSON.stringify(existingState));

      const state = readSyncState(stateFilePath);
      expect(state.taskMappings['1'].githubIssueNumber).toBe(42);
    });

    it('returns empty state on corrupt file', () => {
      fs.writeFileSync(stateFilePath, 'not valid json');
      const state = readSyncState(stateFilePath);
      expect(state.taskMappings).toEqual({});
    });
  });

  describe('writeSyncState', () => {
    it('writes state to file', () => {
      const state = createEmptySyncState();
      writeSyncState(state, stateFilePath);

      expect(fs.existsSync(stateFilePath)).toBe(true);
      const written = JSON.parse(fs.readFileSync(stateFilePath, 'utf-8'));
      expect(written.version).toBe('1.0.0');
      expect(written.lastSyncAt).toBeDefined();
    });

    it('creates directory if needed', () => {
      const nestedPath = path.join(tempDir, 'nested', 'dir', 'state.json');
      const state = createEmptySyncState();
      writeSyncState(state, nestedPath);

      expect(fs.existsSync(nestedPath)).toBe(true);
    });
  });

  describe('isTaskSynced', () => {
    it('returns true for synced task', () => {
      const state: SyncState = {
        taskMappings: {
          '1': {
            taskmasterId: '1',
            githubIssueNumber: 42,
            githubIssueUrl: 'https://github.com/org/repo/issues/42',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
        },
        version: '1.0.0',
      };
      expect(isTaskSynced('1', state)).toBe(true);
    });

    it('returns false for unsynced task', () => {
      const state = createEmptySyncState();
      expect(isTaskSynced('1', state)).toBe(false);
    });
  });

  describe('getTaskMapping', () => {
    it('returns mapping for synced task', () => {
      const state: SyncState = {
        taskMappings: {
          '1': {
            taskmasterId: '1',
            githubIssueNumber: 42,
            githubIssueUrl: 'https://github.com/org/repo/issues/42',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
        },
        version: '1.0.0',
      };
      const mapping = getTaskMapping('1', state);
      expect(mapping?.githubIssueNumber).toBe(42);
    });

    it('returns undefined for unsynced task', () => {
      const state = createEmptySyncState();
      expect(getTaskMapping('1', state)).toBeUndefined();
    });
  });

  describe('addTaskMapping', () => {
    it('adds a new mapping', () => {
      const state = createEmptySyncState();
      const newState = addTaskMapping(state, {
        taskmasterId: '1',
        githubIssueNumber: 42,
        githubIssueUrl: 'https://github.com/org/repo/issues/42',
        syncedAt: '2026-01-21T20:00:00.000Z',
      });

      expect(newState.taskMappings['1']).toBeDefined();
      expect(newState.taskMappings['1'].githubIssueNumber).toBe(42);
    });

    it('does not mutate original state', () => {
      const state = createEmptySyncState();
      addTaskMapping(state, {
        taskmasterId: '1',
        githubIssueNumber: 42,
        githubIssueUrl: 'https://github.com/org/repo/issues/42',
        syncedAt: '2026-01-21T20:00:00.000Z',
      });

      expect(state.taskMappings['1']).toBeUndefined();
    });
  });

  describe('removeTaskMapping', () => {
    it('removes a mapping', () => {
      const state: SyncState = {
        taskMappings: {
          '1': {
            taskmasterId: '1',
            githubIssueNumber: 42,
            githubIssueUrl: 'https://github.com/org/repo/issues/42',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
        },
        version: '1.0.0',
      };
      const newState = removeTaskMapping(state, '1');

      expect(newState.taskMappings['1']).toBeUndefined();
    });
  });

  describe('getSyncedTaskIds', () => {
    it('returns all synced task IDs', () => {
      const state: SyncState = {
        taskMappings: {
          '1': {
            taskmasterId: '1',
            githubIssueNumber: 42,
            githubIssueUrl: 'https://github.com/org/repo/issues/42',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
          '2': {
            taskmasterId: '2',
            githubIssueNumber: 43,
            githubIssueUrl: 'https://github.com/org/repo/issues/43',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
        },
        version: '1.0.0',
      };
      const ids = getSyncedTaskIds(state);
      expect(ids).toContain('1');
      expect(ids).toContain('2');
      expect(ids).toHaveLength(2);
    });
  });

  describe('getAllMappings', () => {
    it('returns all mappings as array', () => {
      const state: SyncState = {
        taskMappings: {
          '1': {
            taskmasterId: '1',
            githubIssueNumber: 42,
            githubIssueUrl: 'https://github.com/org/repo/issues/42',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
        },
        version: '1.0.0',
      };
      const mappings = getAllMappings(state);
      expect(mappings).toHaveLength(1);
      expect(mappings[0].githubIssueNumber).toBe(42);
    });
  });

  describe('findMappingByIssueNumber', () => {
    it('finds mapping by issue number', () => {
      const state: SyncState = {
        taskMappings: {
          '1': {
            taskmasterId: '1',
            githubIssueNumber: 42,
            githubIssueUrl: 'https://github.com/org/repo/issues/42',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
        },
        version: '1.0.0',
      };
      const mapping = findMappingByIssueNumber(42, state);
      expect(mapping?.taskmasterId).toBe('1');
    });

    it('returns undefined for unknown issue number', () => {
      const state = createEmptySyncState();
      expect(findMappingByIssueNumber(999, state)).toBeUndefined();
    });
  });

  describe('Convenience Wrappers', () => {
    it('isSynced reads from file and checks task', () => {
      // Create state with a synced task
      const state: SyncState = {
        taskMappings: {
          '1': {
            taskmasterId: '1',
            githubIssueNumber: 42,
            githubIssueUrl: 'https://github.com/org/repo/issues/42',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
        },
        version: '1.0.0',
      };
      fs.writeFileSync(stateFilePath, JSON.stringify(state));

      expect(isSynced('1', stateFilePath)).toBe(true);
      expect(isSynced('2', stateFilePath)).toBe(false);
    });

    it('markSynced adds a mapping and writes to file', () => {
      // Start with empty state
      const emptyState = createEmptySyncState();
      fs.writeFileSync(stateFilePath, JSON.stringify(emptyState));

      markSynced('1', 42, 'https://github.com/org/repo/issues/42', undefined, stateFilePath);

      // Verify the file was updated
      const state = readSyncState(stateFilePath);
      expect(state.taskMappings['1']).toBeDefined();
      expect(state.taskMappings['1'].githubIssueNumber).toBe(42);
    });

    it('getMapping retrieves mapping from file', () => {
      const state: SyncState = {
        taskMappings: {
          '1': {
            taskmasterId: '1',
            githubIssueNumber: 42,
            githubIssueUrl: 'https://github.com/org/repo/issues/42',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
        },
        version: '1.0.0',
      };
      fs.writeFileSync(stateFilePath, JSON.stringify(state));

      const mapping = getMapping('1', stateFilePath);
      expect(mapping?.githubIssueNumber).toBe(42);
      expect(getMapping('2', stateFilePath)).toBeUndefined();
    });
  });

  describe('Lock Management', () => {
    it('acquires and releases lock', async () => {
      const lockId = await acquireLock(stateFilePath);
      expect(lockId).toBeDefined();
      expect(typeof lockId).toBe('string');

      // Lock file should exist
      const lockPath = stateFilePath + '.lock';
      expect(fs.existsSync(lockPath)).toBe(true);

      // Release the lock
      releaseLock(stateFilePath, lockId);
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('writeSyncStateWithLock writes atomically', async () => {
      const state: SyncState = {
        taskMappings: {
          '1': {
            taskmasterId: '1',
            githubIssueNumber: 42,
            githubIssueUrl: 'https://github.com/org/repo/issues/42',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
        },
        version: '1.0.0',
      };

      await writeSyncStateWithLock(state, stateFilePath);

      // Verify file was written
      const written = readSyncState(stateFilePath);
      expect(written.taskMappings['1'].githubIssueNumber).toBe(42);

      // Lock should be released
      const lockPath = stateFilePath + '.lock';
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('updateSyncStateWithLock updates state atomically', async () => {
      // Start with a state
      const initialState: SyncState = {
        taskMappings: {
          '1': {
            taskmasterId: '1',
            githubIssueNumber: 42,
            githubIssueUrl: 'https://github.com/org/repo/issues/42',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
        },
        version: '1.0.0',
      };
      fs.writeFileSync(stateFilePath, JSON.stringify(initialState));

      // Update with lock
      const newState = await updateSyncStateWithLock(stateFilePath, (current) => {
        return addTaskMapping(current, {
          taskmasterId: '2',
          githubIssueNumber: 43,
          githubIssueUrl: 'https://github.com/org/repo/issues/43',
          syncedAt: new Date().toISOString(),
        });
      });

      expect(newState.taskMappings['1']).toBeDefined();
      expect(newState.taskMappings['2']).toBeDefined();
      expect(newState.taskMappings['2'].githubIssueNumber).toBe(43);

      // Verify file was updated
      const written = readSyncState(stateFilePath);
      expect(written.taskMappings['2'].githubIssueNumber).toBe(43);
    });
  });

  describe('Atomic Writes', () => {
    it('writeSyncState uses atomic temp file + rename', () => {
      const state = createEmptySyncState();
      state.taskMappings['1'] = {
        taskmasterId: '1',
        githubIssueNumber: 42,
        githubIssueUrl: 'https://github.com/org/repo/issues/42',
        syncedAt: '2026-01-21T20:00:00.000Z',
      };

      writeSyncState(state, stateFilePath);

      // File should exist and be valid
      const written = readSyncState(stateFilePath);
      expect(written.taskMappings['1'].githubIssueNumber).toBe(42);

      // No temp files should remain
      const files = fs.readdirSync(tempDir);
      const tempFiles = files.filter(f => f.endsWith('.tmp'));
      expect(tempFiles).toHaveLength(0);
    });
  });

  describe('Cleanup Functions', () => {
    it('cleanupStaleEntries removes mappings for deleted tasks', () => {
      // State has mappings for tasks 1, 2, 3
      const state: SyncState = {
        taskMappings: {
          '1': {
            taskmasterId: '1',
            githubIssueNumber: 42,
            githubIssueUrl: 'https://github.com/org/repo/issues/42',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
          '2': {
            taskmasterId: '2',
            githubIssueNumber: 43,
            githubIssueUrl: 'https://github.com/org/repo/issues/43',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
          '3': {
            taskmasterId: '3',
            githubIssueNumber: 44,
            githubIssueUrl: 'https://github.com/org/repo/issues/44',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
        },
        version: '1.0.0',
      };

      // Current tasks only include 1 and 2 (3 was deleted)
      const currentTasks: TaskmasterTask[] = [
        { id: '1', title: 'Task 1', description: 'Desc', priority: 'high', status: 'pending', dependencies: [], subtasks: [] },
        { id: '2', title: 'Task 2', description: 'Desc', priority: 'medium', status: 'pending', dependencies: [], subtasks: [] },
      ];

      const { state: newState, removedCount } = cleanupStaleEntries(currentTasks, state);

      expect(removedCount).toBe(1);
      expect(newState.taskMappings['1']).toBeDefined();
      expect(newState.taskMappings['2']).toBeDefined();
      expect(newState.taskMappings['3']).toBeUndefined();
    });

    it('cleanupStaleEntries returns 0 when no stale entries', () => {
      const state: SyncState = {
        taskMappings: {
          '1': {
            taskmasterId: '1',
            githubIssueNumber: 42,
            githubIssueUrl: 'https://github.com/org/repo/issues/42',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
        },
        version: '1.0.0',
      };

      const currentTasks: TaskmasterTask[] = [
        { id: '1', title: 'Task 1', description: 'Desc', priority: 'high', status: 'pending', dependencies: [], subtasks: [] },
      ];

      const { removedCount } = cleanupStaleEntries(currentTasks, state);
      expect(removedCount).toBe(0);
    });

    it('cleanupStaleEntriesFromFile updates the file', () => {
      // Write state with stale entry
      const state: SyncState = {
        taskMappings: {
          '1': {
            taskmasterId: '1',
            githubIssueNumber: 42,
            githubIssueUrl: 'https://github.com/org/repo/issues/42',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
          'deleted-task': {
            taskmasterId: 'deleted-task',
            githubIssueNumber: 99,
            githubIssueUrl: 'https://github.com/org/repo/issues/99',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
        },
        version: '1.0.0',
      };
      fs.writeFileSync(stateFilePath, JSON.stringify(state));

      const currentTasks: TaskmasterTask[] = [
        { id: '1', title: 'Task 1', description: 'Desc', priority: 'high', status: 'pending', dependencies: [], subtasks: [] },
      ];

      const removedCount = cleanupStaleEntriesFromFile(currentTasks, stateFilePath);

      expect(removedCount).toBe(1);

      // Verify file was updated
      const written = readSyncState(stateFilePath);
      expect(written.taskMappings['1']).toBeDefined();
      expect(written.taskMappings['deleted-task']).toBeUndefined();
    });
  });

  describe('State Integrity Verification', () => {
    it('verifyStateIntegrity passes for valid state', () => {
      const state: SyncState = {
        taskMappings: {
          '1': {
            taskmasterId: '1',
            githubIssueNumber: 42,
            githubIssueUrl: 'https://github.com/org/repo/issues/42',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
        },
        version: '1.0.0',
      };

      const result = verifyStateIntegrity(state);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('verifyStateIntegrity detects mismatched task IDs', () => {
      const state: SyncState = {
        taskMappings: {
          '1': {
            taskmasterId: '2', // Mismatch!
            githubIssueNumber: 42,
            githubIssueUrl: 'https://github.com/org/repo/issues/42',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
        },
        version: '1.0.0',
      };

      const result = verifyStateIntegrity(state);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('does not match'))).toBe(true);
    });

    it('verifyStateIntegrity detects duplicate issue numbers', () => {
      const state: SyncState = {
        taskMappings: {
          '1': {
            taskmasterId: '1',
            githubIssueNumber: 42, // Duplicate
            githubIssueUrl: 'https://github.com/org/repo/issues/42',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
          '2': {
            taskmasterId: '2',
            githubIssueNumber: 42, // Duplicate
            githubIssueUrl: 'https://github.com/org/repo/issues/42',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
        },
        version: '1.0.0',
      };

      const result = verifyStateIntegrity(state);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('Duplicate issue number'))).toBe(true);
    });

    it('verifyStateIntegrity detects invalid issue numbers', () => {
      const state: SyncState = {
        taskMappings: {
          '1': {
            taskmasterId: '1',
            githubIssueNumber: 0, // Invalid
            githubIssueUrl: 'https://github.com/org/repo/issues/42',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
        },
        version: '1.0.0',
      };

      const result = verifyStateIntegrity(state);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('Invalid issue number'))).toBe(true);
    });
  });
});

describe('Idempotency Tests', () => {
  let tempDir: string;
  let tasksFilePath: string;
  let stateFilePath: string;

  // Sample tasks for idempotency testing
  const sampleTasksFile = {
    master: {
      tasks: [
        {
          id: '1',
          title: 'Task One',
          description: 'First task',
          priority: 'high',
          dependencies: [],
          status: 'pending',
          subtasks: [],
        },
        {
          id: '2',
          title: 'Task Two',
          description: 'Second task',
          priority: 'medium',
          dependencies: ['1'],
          status: 'pending',
          subtasks: [],
        },
        {
          id: '3',
          title: 'Task Three',
          description: 'Third task',
          priority: 'low',
          dependencies: [],
          status: 'done',
          subtasks: [],
        },
      ],
      metadata: {
        version: '1.0.0',
        lastModified: '2026-01-21T20:00:00.000Z',
        taskCount: 3,
        completedCount: 1,
        tags: ['test'],
      },
    },
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idempotency-test-'));
    tasksFilePath = path.join(tempDir, 'tasks.json');
    stateFilePath = path.join(tempDir, 'sync-state.json');
    fs.writeFileSync(tasksFilePath, JSON.stringify(sampleTasksFile, null, 2));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('filterUnsyncedTasks', () => {
    it('returns all tasks when state is empty', () => {
      const tasks = getAllTasks(tasksFilePath);
      const state = createEmptySyncState();

      const unsynced = filterUnsyncedTasks(tasks, state);
      expect(unsynced).toHaveLength(3);
    });

    it('filters out synced tasks', () => {
      const tasks = getAllTasks(tasksFilePath);
      const state: SyncState = {
        taskMappings: {
          '1': {
            taskmasterId: '1',
            githubIssueNumber: 42,
            githubIssueUrl: 'https://github.com/org/repo/issues/42',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
        },
        version: '1.0.0',
      };

      const unsynced = filterUnsyncedTasks(tasks, state);
      expect(unsynced).toHaveLength(2);
      expect(unsynced.map(t => t.id)).not.toContain('1');
    });

    it('returns empty array when all tasks are synced', () => {
      const tasks = getAllTasks(tasksFilePath);
      const state: SyncState = {
        taskMappings: {
          '1': {
            taskmasterId: '1',
            githubIssueNumber: 42,
            githubIssueUrl: 'https://github.com/org/repo/issues/42',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
          '2': {
            taskmasterId: '2',
            githubIssueNumber: 43,
            githubIssueUrl: 'https://github.com/org/repo/issues/43',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
          '3': {
            taskmasterId: '3',
            githubIssueNumber: 44,
            githubIssueUrl: 'https://github.com/org/repo/issues/44',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
        },
        version: '1.0.0',
      };

      const unsynced = filterUnsyncedTasks(tasks, state);
      expect(unsynced).toHaveLength(0);
    });
  });

  describe('verifySyncIdempotency', () => {
    it('reports not idempotent when tasks are not synced', () => {
      const result = verifySyncIdempotency({
        tasksPath: tasksFilePath,
        statePath: stateFilePath,
      });

      expect(result.isIdempotent).toBe(false);
      expect(result.totalTasks).toBe(3);
      expect(result.syncedTasks).toBe(0);
      expect(result.unsyncedTasks).toBe(3);
      expect(result.unsyncedTaskIds).toEqual(['1', '2', '3']);
    });

    it('reports idempotent when all tasks are synced', () => {
      // Write state with all tasks synced
      const state: SyncState = {
        taskMappings: {
          '1': {
            taskmasterId: '1',
            githubIssueNumber: 42,
            githubIssueUrl: 'https://github.com/org/repo/issues/42',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
          '2': {
            taskmasterId: '2',
            githubIssueNumber: 43,
            githubIssueUrl: 'https://github.com/org/repo/issues/43',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
          '3': {
            taskmasterId: '3',
            githubIssueNumber: 44,
            githubIssueUrl: 'https://github.com/org/repo/issues/44',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
        },
        version: '1.0.0',
      };
      fs.writeFileSync(stateFilePath, JSON.stringify(state));

      const result = verifySyncIdempotency({
        tasksPath: tasksFilePath,
        statePath: stateFilePath,
      });

      expect(result.isIdempotent).toBe(true);
      expect(result.totalTasks).toBe(3);
      expect(result.syncedTasks).toBe(3);
      expect(result.unsyncedTasks).toBe(0);
      expect(result.unsyncedTaskIds).toEqual([]);
    });

    it('reports partial sync correctly', () => {
      // Write state with some tasks synced
      const state: SyncState = {
        taskMappings: {
          '1': {
            taskmasterId: '1',
            githubIssueNumber: 42,
            githubIssueUrl: 'https://github.com/org/repo/issues/42',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
        },
        version: '1.0.0',
      };
      fs.writeFileSync(stateFilePath, JSON.stringify(state));

      const result = verifySyncIdempotency({
        tasksPath: tasksFilePath,
        statePath: stateFilePath,
      });

      expect(result.isIdempotent).toBe(false);
      expect(result.totalTasks).toBe(3);
      expect(result.syncedTasks).toBe(1);
      expect(result.unsyncedTasks).toBe(2);
      expect(result.unsyncedTaskIds).toContain('2');
      expect(result.unsyncedTaskIds).toContain('3');
      expect(result.unsyncedTaskIds).not.toContain('1');
    });
  });

  describe('Duplicate Prevention', () => {
    it('isTaskSynced correctly identifies synced tasks', () => {
      const state: SyncState = {
        taskMappings: {
          '1': {
            taskmasterId: '1',
            githubIssueNumber: 42,
            githubIssueUrl: 'https://github.com/org/repo/issues/42',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
        },
        version: '1.0.0',
      };

      expect(isTaskSynced('1', state)).toBe(true);
      expect(isTaskSynced('2', state)).toBe(false);
      expect(isTaskSynced('nonexistent', state)).toBe(false);
    });

    it('second sync attempt on same task file produces no new syncs', () => {
      // First "sync" - mark all tasks as synced
      let state = createEmptySyncState();
      const tasks = getAllTasks(tasksFilePath);

      for (let i = 0; i < tasks.length; i++) {
        state = addTaskMapping(state, {
          taskmasterId: tasks[i].id,
          githubIssueNumber: 100 + i,
          githubIssueUrl: `https://github.com/org/repo/issues/${100 + i}`,
          syncedAt: new Date().toISOString(),
        });
      }
      writeSyncState(state, stateFilePath);

      // Second "sync" attempt - should find no tasks to sync
      const freshTasks = getAllTasks(tasksFilePath);
      const freshState = readSyncState(stateFilePath);
      const tasksToSync = filterUnsyncedTasks(freshTasks, freshState);

      expect(tasksToSync).toHaveLength(0);
    });

    it('multiple rapid syncs do not create duplicates', async () => {
      // Simulate rapid-fire sync attempts
      const tasks = getAllTasks(tasksFilePath);
      let state = createEmptySyncState();
      const syncedIds = new Set<string>();

      // Simulate 3 rapid sync attempts
      for (let attempt = 0; attempt < 3; attempt++) {
        const tasksToSync = filterUnsyncedTasks(tasks, state);

        for (const task of tasksToSync) {
          // Double-check before "syncing"
          if (!isTaskSynced(task.id, state)) {
            state = addTaskMapping(state, {
              taskmasterId: task.id,
              githubIssueNumber: parseInt(task.id) + 100,
              githubIssueUrl: `https://github.com/org/repo/issues/${parseInt(task.id) + 100}`,
              syncedAt: new Date().toISOString(),
            });
            syncedIds.add(task.id);
          }
        }
      }

      // Should have exactly 3 synced tasks, not 9
      expect(Object.keys(state.taskMappings)).toHaveLength(3);
      expect(syncedIds.size).toBe(3);
    });
  });

  describe('State Persistence', () => {
    it('state persists across read/write cycles', () => {
      const originalState: SyncState = {
        taskMappings: {
          '1': {
            taskmasterId: '1',
            githubIssueNumber: 42,
            githubIssueUrl: 'https://github.com/org/repo/issues/42',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
        },
        version: '1.0.0',
      };

      // Write
      writeSyncState(originalState, stateFilePath);

      // Read
      const readState = readSyncState(stateFilePath);

      expect(readState.taskMappings['1'].githubIssueNumber).toBe(42);
      expect(readState.version).toBe('1.0.0');
    });

    it('incremental updates preserve existing mappings', () => {
      // Write initial state
      const initialState: SyncState = {
        taskMappings: {
          '1': {
            taskmasterId: '1',
            githubIssueNumber: 42,
            githubIssueUrl: 'https://github.com/org/repo/issues/42',
            syncedAt: '2026-01-21T20:00:00.000Z',
          },
        },
        version: '1.0.0',
      };
      writeSyncState(initialState, stateFilePath);

      // Add another mapping
      let state = readSyncState(stateFilePath);
      state = addTaskMapping(state, {
        taskmasterId: '2',
        githubIssueNumber: 43,
        githubIssueUrl: 'https://github.com/org/repo/issues/43',
        syncedAt: new Date().toISOString(),
      });
      writeSyncState(state, stateFilePath);

      // Verify both mappings exist
      const finalState = readSyncState(stateFilePath);
      expect(Object.keys(finalState.taskMappings)).toHaveLength(2);
      expect(finalState.taskMappings['1'].githubIssueNumber).toBe(42);
      expect(finalState.taskMappings['2'].githubIssueNumber).toBe(43);
    });
  });
});
