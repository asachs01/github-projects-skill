import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { TaskmasterTask, SyncState } from '../hook/types.js';
import {
  mapPriorityToLabel,
  formatIssueBody,
  resolveDependencies,
  mapTaskToIssue,
  mapTasksToIssues,
  filterUnsyncedTasks,
  type MapperOptions,
} from '../hook/mapper.js';

// Sample task data for testing
const createSampleTask = (overrides: Partial<TaskmasterTask> = {}): TaskmasterTask => ({
  id: '1',
  title: 'Test Task Title',
  description: 'This is the task description',
  details: 'These are the implementation details',
  testStrategy: 'Unit tests should cover all edge cases',
  priority: 'high',
  dependencies: [],
  status: 'pending',
  subtasks: [],
  updatedAt: '2026-01-21T20:00:00.000Z',
  ...overrides,
});

const createSyncState = (mappings: Record<string, { issueNumber: number; url: string }> = {}): SyncState => {
  const taskMappings: SyncState['taskMappings'] = {};
  for (const [taskId, { issueNumber, url }] of Object.entries(mappings)) {
    taskMappings[taskId] = {
      taskmasterId: taskId,
      githubIssueNumber: issueNumber,
      githubIssueUrl: url,
      syncedAt: '2026-01-21T20:00:00.000Z',
    };
  }
  return {
    taskMappings,
    version: '1.0.0',
  };
};

describe('Mapper: mapPriorityToLabel', () => {
  it('maps high priority to priority:high label', () => {
    expect(mapPriorityToLabel('high')).toBe('priority:high');
  });

  it('maps medium priority to priority:medium label', () => {
    expect(mapPriorityToLabel('medium')).toBe('priority:medium');
  });

  it('maps low priority to priority:low label', () => {
    expect(mapPriorityToLabel('low')).toBe('priority:low');
  });
});

describe('Mapper: resolveDependencies', () => {
  it('returns empty arrays when no dependencies', () => {
    const result = resolveDependencies([], createSyncState());
    expect(result.resolved).toEqual([]);
    expect(result.unresolved).toEqual([]);
  });

  it('resolves dependencies that exist in sync state', () => {
    const syncState = createSyncState({
      '2': { issueNumber: 42, url: 'https://github.com/org/repo/issues/42' },
      '3': { issueNumber: 43, url: 'https://github.com/org/repo/issues/43' },
    });

    const result = resolveDependencies(['2', '3'], syncState);

    expect(result.resolved).toHaveLength(2);
    expect(result.resolved[0]).toEqual({ taskId: '2', issueNumber: 42 });
    expect(result.resolved[1]).toEqual({ taskId: '3', issueNumber: 43 });
    expect(result.unresolved).toEqual([]);
  });

  it('marks unsynced dependencies as unresolved', () => {
    const syncState = createSyncState({
      '2': { issueNumber: 42, url: 'https://github.com/org/repo/issues/42' },
    });

    const result = resolveDependencies(['2', '4'], syncState);

    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0]).toEqual({ taskId: '2', issueNumber: 42 });
    expect(result.unresolved).toEqual(['4']);
  });

  it('handles missing sync state gracefully', () => {
    const result = resolveDependencies(['2', '3'], undefined);
    expect(result.resolved).toEqual([]);
    expect(result.unresolved).toEqual(['2', '3']);
  });
});

describe('Mapper: formatIssueBody', () => {
  it('formats body with all sections when all fields present', () => {
    const task = createSampleTask();
    const body = formatIssueBody(task, [], []);

    expect(body).toContain('## Description');
    expect(body).toContain('This is the task description');
    expect(body).toContain('## Implementation Details');
    expect(body).toContain('These are the implementation details');
    expect(body).toContain('## Test Strategy');
    expect(body).toContain('Unit tests should cover all edge cases');
    expect(body).toContain('*Synced from Taskmaster task #1*');
  });

  it('omits Implementation Details section when details is empty', () => {
    const task = createSampleTask({ details: '' });
    const body = formatIssueBody(task, [], []);

    expect(body).toContain('## Description');
    expect(body).not.toContain('## Implementation Details');
    expect(body).toContain('## Test Strategy');
  });

  it('omits Implementation Details section when details is undefined', () => {
    const task = createSampleTask({ details: undefined });
    const body = formatIssueBody(task, [], []);

    expect(body).not.toContain('## Implementation Details');
  });

  it('omits Test Strategy section when testStrategy is empty', () => {
    const task = createSampleTask({ testStrategy: '' });
    const body = formatIssueBody(task, [], []);

    expect(body).not.toContain('## Test Strategy');
  });

  it('omits Test Strategy section when testStrategy is undefined', () => {
    const task = createSampleTask({ testStrategy: undefined });
    const body = formatIssueBody(task, [], []);

    expect(body).not.toContain('## Test Strategy');
  });

  it('includes resolved dependencies with issue references', () => {
    const task = createSampleTask();
    const resolvedDeps = [
      { taskId: '2', issueNumber: 42 },
      { taskId: '3', issueNumber: 43 },
    ];
    const body = formatIssueBody(task, resolvedDeps, []);

    expect(body).toContain('## Dependencies');
    expect(body).toContain('- Depends on #42');
    expect(body).toContain('- Depends on #43');
  });

  it('includes unresolved dependencies with task references', () => {
    const task = createSampleTask();
    const body = formatIssueBody(task, [], ['4', '5']);

    expect(body).toContain('## Dependencies');
    expect(body).toContain('- Depends on Taskmaster task #4 (not yet synced)');
    expect(body).toContain('- Depends on Taskmaster task #5 (not yet synced)');
  });

  it('includes both resolved and unresolved dependencies', () => {
    const task = createSampleTask();
    const resolvedDeps = [{ taskId: '2', issueNumber: 42 }];
    const body = formatIssueBody(task, resolvedDeps, ['4']);

    expect(body).toContain('## Dependencies');
    expect(body).toContain('- Depends on #42');
    expect(body).toContain('- Depends on Taskmaster task #4 (not yet synced)');
  });

  it('omits Dependencies section when no dependencies', () => {
    const task = createSampleTask();
    const body = formatIssueBody(task, [], []);

    expect(body).not.toContain('## Dependencies');
  });

  it('always includes footer with task ID', () => {
    const task = createSampleTask({ id: '42' });
    const body = formatIssueBody(task, [], []);

    expect(body).toContain('---');
    expect(body).toContain('*Synced from Taskmaster task #42*');
  });
});

describe('Mapper: mapTaskToIssue', () => {
  const defaultOptions: MapperOptions = {
    owner: 'test-owner',
    repo: 'test-repo',
  };

  it('maps task title to issue title', () => {
    const task = createSampleTask({ title: 'My Custom Title' });
    const result = mapTaskToIssue(task, defaultOptions);

    expect(result.issueInput.title).toBe('My Custom Title');
  });

  it('includes owner and repo in issue input', () => {
    const task = createSampleTask();
    const result = mapTaskToIssue(task, defaultOptions);

    expect(result.issueInput.owner).toBe('test-owner');
    expect(result.issueInput.repo).toBe('test-repo');
  });

  it('includes priority label in issue labels', () => {
    const task = createSampleTask({ priority: 'medium' });
    const result = mapTaskToIssue(task, defaultOptions);

    expect(result.issueInput.labels).toContain('priority:medium');
    expect(result.priorityLabel).toBe('priority:medium');
  });

  it('includes formatted body in issue input', () => {
    const task = createSampleTask();
    const result = mapTaskToIssue(task, defaultOptions);

    expect(result.issueInput.body).toContain('## Description');
    expect(result.issueInput.body).toContain(task.description);
  });

  it('returns task ID in result', () => {
    const task = createSampleTask({ id: '42' });
    const result = mapTaskToIssue(task, defaultOptions);

    expect(result.taskId).toBe('42');
  });

  it('resolves dependencies using sync state', () => {
    const task = createSampleTask({ dependencies: ['2', '3'] });
    const syncState = createSyncState({
      '2': { issueNumber: 10, url: 'https://github.com/org/repo/issues/10' },
    });
    const options: MapperOptions = { ...defaultOptions, syncState };

    const result = mapTaskToIssue(task, options);

    expect(result.resolvedDependencies).toHaveLength(1);
    expect(result.resolvedDependencies[0]).toEqual({ taskId: '2', issueNumber: 10 });
    expect(result.unresolvedDependencies).toEqual(['3']);
  });

  it('includes dependency references in body', () => {
    const task = createSampleTask({ dependencies: ['2'] });
    const syncState = createSyncState({
      '2': { issueNumber: 10, url: 'https://github.com/org/repo/issues/10' },
    });
    const options: MapperOptions = { ...defaultOptions, syncState };

    const result = mapTaskToIssue(task, options);

    expect(result.issueInput.body).toContain('Depends on #10');
  });
});

describe('Mapper: mapTasksToIssues', () => {
  const defaultOptions: MapperOptions = {
    owner: 'test-owner',
    repo: 'test-repo',
  };

  it('maps multiple tasks to issues', () => {
    const tasks = [
      createSampleTask({ id: '1', title: 'Task 1' }),
      createSampleTask({ id: '2', title: 'Task 2' }),
      createSampleTask({ id: '3', title: 'Task 3' }),
    ];

    const results = mapTasksToIssues(tasks, defaultOptions);

    expect(results).toHaveLength(3);
    expect(results[0].taskId).toBe('1');
    expect(results[0].issueInput.title).toBe('Task 1');
    expect(results[1].taskId).toBe('2');
    expect(results[2].taskId).toBe('3');
  });

  it('returns empty array for empty task list', () => {
    const results = mapTasksToIssues([], defaultOptions);
    expect(results).toEqual([]);
  });
});

describe('Mapper: filterUnsyncedTasks', () => {
  it('returns all tasks when sync state is empty', () => {
    const tasks = [
      createSampleTask({ id: '1' }),
      createSampleTask({ id: '2' }),
      createSampleTask({ id: '3' }),
    ];
    const syncState = createSyncState();

    const result = filterUnsyncedTasks(tasks, syncState);

    expect(result).toHaveLength(3);
    expect(result.map(t => t.id)).toEqual(['1', '2', '3']);
  });

  it('filters out synced tasks', () => {
    const tasks = [
      createSampleTask({ id: '1' }),
      createSampleTask({ id: '2' }),
      createSampleTask({ id: '3' }),
    ];
    const syncState = createSyncState({
      '1': { issueNumber: 10, url: 'https://github.com/org/repo/issues/10' },
      '3': { issueNumber: 12, url: 'https://github.com/org/repo/issues/12' },
    });

    const result = filterUnsyncedTasks(tasks, syncState);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('returns empty array when all tasks are synced', () => {
    const tasks = [
      createSampleTask({ id: '1' }),
      createSampleTask({ id: '2' }),
    ];
    const syncState = createSyncState({
      '1': { issueNumber: 10, url: 'https://github.com/org/repo/issues/10' },
      '2': { issueNumber: 11, url: 'https://github.com/org/repo/issues/11' },
    });

    const result = filterUnsyncedTasks(tasks, syncState);

    expect(result).toEqual([]);
  });

  it('returns empty array for empty task list', () => {
    const syncState = createSyncState();
    const result = filterUnsyncedTasks([], syncState);
    expect(result).toEqual([]);
  });
});

describe('Mapper: End-to-End Issue Body Format', () => {
  it('produces correctly formatted body matching specification', () => {
    const task: TaskmasterTask = {
      id: '12',
      title: 'Implement Feature X',
      description: 'Add support for feature X to the application.',
      details: 'Create the component, add API endpoints, update UI.',
      testStrategy: 'Write unit tests for component logic and integration tests for API.',
      priority: 'high',
      dependencies: ['10', '11'],
      status: 'pending',
      subtasks: [],
    };

    const syncState = createSyncState({
      '10': { issueNumber: 50, url: 'https://github.com/org/repo/issues/50' },
    });

    const options: MapperOptions = {
      owner: 'myorg',
      repo: 'myrepo',
      syncState,
    };

    const result = mapTaskToIssue(task, options);

    // Verify the body format matches the specification
    const expectedBodyParts = [
      '## Description',
      'Add support for feature X to the application.',
      '## Implementation Details',
      'Create the component, add API endpoints, update UI.',
      '## Dependencies',
      '- Depends on #50',
      '- Depends on Taskmaster task #11 (not yet synced)',
      '## Test Strategy',
      'Write unit tests for component logic and integration tests for API.',
      '---',
      '*Synced from Taskmaster task #12*',
    ];

    for (const part of expectedBodyParts) {
      expect(result.issueInput.body).toContain(part);
    }

    // Verify issue input structure
    expect(result.issueInput.owner).toBe('myorg');
    expect(result.issueInput.repo).toBe('myrepo');
    expect(result.issueInput.title).toBe('Implement Feature X');
    expect(result.issueInput.labels).toEqual(['priority:high']);

    // Verify metadata
    expect(result.taskId).toBe('12');
    expect(result.priorityLabel).toBe('priority:high');
    expect(result.resolvedDependencies).toEqual([{ taskId: '10', issueNumber: 50 }]);
    expect(result.unresolvedDependencies).toEqual(['11']);
  });

  it('handles minimal task (only required fields)', () => {
    const task: TaskmasterTask = {
      id: '1',
      title: 'Simple Task',
      description: 'A simple description.',
      priority: 'low',
      dependencies: [],
      status: 'pending',
      subtasks: [],
    };

    const result = mapTaskToIssue(task, { owner: 'o', repo: 'r' });

    // Should have Description and footer only
    expect(result.issueInput.body).toContain('## Description');
    expect(result.issueInput.body).toContain('A simple description.');
    expect(result.issueInput.body).not.toContain('## Implementation Details');
    expect(result.issueInput.body).not.toContain('## Dependencies');
    expect(result.issueInput.body).not.toContain('## Test Strategy');
    expect(result.issueInput.body).toContain('*Synced from Taskmaster task #1*');
  });
});

describe('Mapper: Integration with File System', () => {
  let tempDir: string;
  let tasksFilePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapper-test-'));
    tasksFilePath = path.join(tempDir, 'tasks.json');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('maps tasks from a real tasks.json structure', () => {
    // Create a tasks.json file similar to actual Taskmaster format
    const tasksFile = {
      master: {
        tasks: [
          {
            id: '1',
            title: 'First Task',
            description: 'Description 1',
            details: 'Details 1',
            testStrategy: 'Test 1',
            priority: 'high',
            dependencies: [],
            status: 'pending',
            subtasks: [],
          },
          {
            id: '2',
            title: 'Second Task',
            description: 'Description 2',
            priority: 'medium',
            dependencies: ['1'],
            status: 'pending',
            subtasks: [],
          },
        ],
        metadata: {
          version: '1.0.0',
          taskCount: 2,
        },
      },
    };

    fs.writeFileSync(tasksFilePath, JSON.stringify(tasksFile, null, 2));

    // Read and map tasks
    const content = fs.readFileSync(tasksFilePath, 'utf-8');
    const parsed = JSON.parse(content);
    const tasks = parsed.master.tasks as TaskmasterTask[];

    // Simulate syncing first task
    const syncState = createSyncState({
      '1': { issueNumber: 100, url: 'https://github.com/org/repo/issues/100' },
    });

    const options: MapperOptions = {
      owner: 'org',
      repo: 'repo',
      syncState,
    };

    // Map the second task (which depends on the first)
    const result = mapTaskToIssue(tasks[1], options);

    expect(result.issueInput.title).toBe('Second Task');
    expect(result.issueInput.body).toContain('Depends on #100');
    expect(result.resolvedDependencies).toEqual([{ taskId: '1', issueNumber: 100 }]);
  });
});
