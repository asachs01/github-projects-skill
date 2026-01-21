import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { 
// Types
TaskmasterTaskSchema, TasksFileSchema, SyncStateSchema, 
// Reader functions
readTasksFile, getAllTasks, getTasksByStatus, getTaskById, getPendingTasks, getInProgressTasks, getDoneTasks, 
// State functions
createEmptySyncState, readSyncState, writeSyncState, isTaskSynced, getTaskMapping, addTaskMapping, removeTaskMapping, getSyncedTaskIds, getAllMappings, findMappingByIssueNumber, } from '../hook/index.js';
// Sample task data matching the actual tasks.json format
const sampleTask = {
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
    let tempDir;
    let tasksFilePath;
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
    let tempDir;
    let stateFilePath;
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
            const existingState = {
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
            const state = {
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
            const state = {
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
            const state = {
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
            const state = {
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
            const state = {
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
            const state = {
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
});
//# sourceMappingURL=hook.test.js.map