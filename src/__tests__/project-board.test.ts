import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  determineInitialStatus,
  hasUnresolvedDependencies,
  findStatusOptionId,
  validateStatus,
  selectProjectForRepo,
  type InitialStatusOptions,
} from '../hook/project-board.js';
import type { TaskmasterTask, SyncState } from '../hook/types.js';
import type { NormalizedConfig, NormalizedProjectConfig } from '../types/config.js';
import type { ProjectContext } from '../github/types.js';
import { GitHubClientError } from '../github/client.js';

// Sample task data
const createTask = (overrides: Partial<TaskmasterTask> = {}): TaskmasterTask => ({
  id: '1',
  title: 'Test Task',
  description: 'A test task',
  priority: 'high',
  dependencies: [],
  status: 'pending',
  subtasks: [],
  ...overrides,
});

// Sample sync state
const createSyncState = (mappings: Record<string, {
  taskmasterId: string;
  githubIssueNumber: number;
  githubIssueUrl: string;
  syncedAt: string;
}> = {}): SyncState => ({
  taskMappings: mappings,
  version: '1.0.0',
});

// Sample status mapping
const defaultStatusMapping: NormalizedConfig['statusFieldMapping'] = {
  backlog: 'Backlog',
  ready: 'Ready',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
};

// Sample project context
const createProjectContext = (): ProjectContext => ({
  projectId: 'PVT_test123',
  projectNumber: 1,
  statusFieldId: 'PVTSSF_test456',
  statusOptions: new Map([
    ['backlog', 'opt_backlog'],
    ['ready', 'opt_ready'],
    ['in progress', 'opt_in_progress'],
    ['blocked', 'opt_blocked'],
    ['done', 'opt_done'],
  ]),
  cachedAt: Date.now(),
});

// Sample config
const createConfig = (): NormalizedConfig => ({
  github: { token: undefined },
  projects: [
    {
      name: 'Test Project',
      org: 'testorg',
      projectNumber: 1,
      repos: ['testorg/testrepo'],
    },
    {
      name: 'Multi-Repo Project',
      org: 'testorg',
      projectNumber: 2,
      repos: ['testorg/repo1', 'testorg/repo2'],
    },
  ],
  statusFieldMapping: defaultStatusMapping,
  labels: {
    blocked_prefix: 'blocked:',
    priority_prefix: 'priority:',
    type_prefix: 'type:',
  },
});

describe('Project Board Integration', () => {
  describe('determineInitialStatus', () => {
    it('returns Ready status for tasks with no dependencies', () => {
      const options: InitialStatusOptions = {
        task: createTask({ dependencies: [] }),
        syncState: createSyncState(),
        statusMapping: defaultStatusMapping,
      };

      const status = determineInitialStatus(options);
      expect(status).toBe('Ready');
    });

    it('returns Backlog status for tasks with dependencies', () => {
      const options: InitialStatusOptions = {
        task: createTask({ dependencies: ['2', '3'] }),
        syncState: createSyncState(),
        statusMapping: defaultStatusMapping,
      };

      const status = determineInitialStatus(options);
      expect(status).toBe('Backlog');
    });

    it('returns Backlog status even when all dependencies are synced', () => {
      const syncState = createSyncState({
        '2': {
          taskmasterId: '2',
          githubIssueNumber: 10,
          githubIssueUrl: 'https://github.com/org/repo/issues/10',
          syncedAt: '2026-01-21T20:00:00.000Z',
        },
      });

      const options: InitialStatusOptions = {
        task: createTask({ dependencies: ['2'] }),
        syncState,
        statusMapping: defaultStatusMapping,
      };

      // Tasks with dependencies always go to Backlog initially
      const status = determineInitialStatus(options);
      expect(status).toBe('Backlog');
    });

    it('uses custom status mapping values', () => {
      const customStatusMapping = {
        ...defaultStatusMapping,
        ready: 'Todo',
        backlog: 'Icebox',
      };

      const optionsNoDeps: InitialStatusOptions = {
        task: createTask({ dependencies: [] }),
        syncState: createSyncState(),
        statusMapping: customStatusMapping,
      };

      const optionsWithDeps: InitialStatusOptions = {
        task: createTask({ dependencies: ['2'] }),
        syncState: createSyncState(),
        statusMapping: customStatusMapping,
      };

      expect(determineInitialStatus(optionsNoDeps)).toBe('Todo');
      expect(determineInitialStatus(optionsWithDeps)).toBe('Icebox');
    });

    it('handles tasks with undefined dependencies', () => {
      const task = createTask();
      // Explicitly set dependencies to undefined to test edge case
      (task as Record<string, unknown>).dependencies = undefined;

      const options: InitialStatusOptions = {
        task,
        syncState: createSyncState(),
        statusMapping: defaultStatusMapping,
      };

      // Should treat undefined dependencies as no dependencies
      const status = determineInitialStatus(options);
      expect(status).toBe('Ready');
    });
  });

  describe('hasUnresolvedDependencies', () => {
    it('returns false for tasks with no dependencies', () => {
      const task = createTask({ dependencies: [] });
      const syncState = createSyncState();

      expect(hasUnresolvedDependencies(task, syncState)).toBe(false);
    });

    it('returns true when some dependencies are not synced', () => {
      const syncState = createSyncState({
        '2': {
          taskmasterId: '2',
          githubIssueNumber: 10,
          githubIssueUrl: 'https://github.com/org/repo/issues/10',
          syncedAt: '2026-01-21T20:00:00.000Z',
        },
      });

      const task = createTask({ dependencies: ['2', '3'] });
      expect(hasUnresolvedDependencies(task, syncState)).toBe(true);
    });

    it('returns false when all dependencies are synced', () => {
      const syncState = createSyncState({
        '2': {
          taskmasterId: '2',
          githubIssueNumber: 10,
          githubIssueUrl: 'https://github.com/org/repo/issues/10',
          syncedAt: '2026-01-21T20:00:00.000Z',
        },
        '3': {
          taskmasterId: '3',
          githubIssueNumber: 11,
          githubIssueUrl: 'https://github.com/org/repo/issues/11',
          syncedAt: '2026-01-21T20:00:00.000Z',
        },
      });

      const task = createTask({ dependencies: ['2', '3'] });
      expect(hasUnresolvedDependencies(task, syncState)).toBe(false);
    });

    it('handles undefined dependencies', () => {
      const task = createTask();
      (task as Record<string, unknown>).dependencies = undefined;
      const syncState = createSyncState();

      expect(hasUnresolvedDependencies(task, syncState)).toBe(false);
    });
  });

  describe('findStatusOptionId', () => {
    it('finds status option ID with exact case match', () => {
      const context = createProjectContext();

      const optionId = findStatusOptionId(context, 'backlog');
      expect(optionId).toBe('opt_backlog');
    });

    it('finds status option ID with case-insensitive match', () => {
      const context = createProjectContext();

      expect(findStatusOptionId(context, 'Backlog')).toBe('opt_backlog');
      expect(findStatusOptionId(context, 'BACKLOG')).toBe('opt_backlog');
      expect(findStatusOptionId(context, 'In Progress')).toBe('opt_in_progress');
    });

    it('returns undefined for unknown status', () => {
      const context = createProjectContext();

      expect(findStatusOptionId(context, 'unknown')).toBeUndefined();
      expect(findStatusOptionId(context, 'nonexistent')).toBeUndefined();
    });
  });

  describe('validateStatus', () => {
    it('does not throw for valid status', () => {
      const context = createProjectContext();

      expect(() => validateStatus(context, 'backlog')).not.toThrow();
      expect(() => validateStatus(context, 'Ready')).not.toThrow();
    });

    it('throws GitHubClientError for invalid status', () => {
      const context = createProjectContext();

      expect(() => validateStatus(context, 'invalid')).toThrow(GitHubClientError);
      expect(() => validateStatus(context, 'invalid')).toThrow(
        /Status "invalid" not found in project/
      );
    });

    it('includes available statuses in error message', () => {
      const context = createProjectContext();

      try {
        validateStatus(context, 'invalid');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(GitHubClientError);
        expect((error as Error).message).toContain('Available statuses:');
        expect((error as Error).message).toContain('backlog');
      }
    });
  });

  describe('selectProjectForRepo', () => {
    it('finds project by exact repo match', () => {
      const config = createConfig();

      const project = selectProjectForRepo('testorg/testrepo', config);
      expect(project).toBeDefined();
      expect(project?.name).toBe('Test Project');
    });

    it('finds project with case-insensitive match', () => {
      const config = createConfig();

      const project = selectProjectForRepo('TESTORG/TESTREPO', config);
      expect(project).toBeDefined();
      expect(project?.name).toBe('Test Project');
    });

    it('finds project in multi-repo configuration', () => {
      const config = createConfig();

      const project1 = selectProjectForRepo('testorg/repo1', config);
      const project2 = selectProjectForRepo('testorg/repo2', config);

      expect(project1).toBeDefined();
      expect(project1?.name).toBe('Multi-Repo Project');
      expect(project2).toBeDefined();
      expect(project2?.name).toBe('Multi-Repo Project');
    });

    it('returns undefined for unknown repo', () => {
      const config = createConfig();

      const project = selectProjectForRepo('unknown/repo', config);
      expect(project).toBeUndefined();
    });

    it('returns first matching project when repo appears in multiple', () => {
      // Create config where same repo is in multiple projects
      const config: NormalizedConfig = {
        ...createConfig(),
        projects: [
          {
            name: 'First Project',
            org: 'testorg',
            projectNumber: 1,
            repos: ['testorg/shared-repo'],
          },
          {
            name: 'Second Project',
            org: 'testorg',
            projectNumber: 2,
            repos: ['testorg/shared-repo'],
          },
        ],
      };

      const project = selectProjectForRepo('testorg/shared-repo', config);
      expect(project?.name).toBe('First Project');
    });
  });

  describe('Integration scenarios', () => {
    it('correctly handles a new task without dependencies', () => {
      const task = createTask({
        id: 'new-task',
        title: 'New Feature',
        dependencies: [],
      });
      const syncState = createSyncState();
      const config = createConfig();

      const status = determineInitialStatus({
        task,
        syncState,
        statusMapping: config.statusFieldMapping,
      });

      expect(status).toBe('Ready');
      expect(hasUnresolvedDependencies(task, syncState)).toBe(false);
    });

    it('correctly handles a task with all dependencies synced', () => {
      const syncState = createSyncState({
        'dep-1': {
          taskmasterId: 'dep-1',
          githubIssueNumber: 1,
          githubIssueUrl: 'https://github.com/org/repo/issues/1',
          syncedAt: '2026-01-21T20:00:00.000Z',
        },
        'dep-2': {
          taskmasterId: 'dep-2',
          githubIssueNumber: 2,
          githubIssueUrl: 'https://github.com/org/repo/issues/2',
          syncedAt: '2026-01-21T20:00:00.000Z',
        },
      });

      const task = createTask({
        id: 'dependent-task',
        title: 'Dependent Feature',
        dependencies: ['dep-1', 'dep-2'],
      });
      const config = createConfig();

      const status = determineInitialStatus({
        task,
        syncState,
        statusMapping: config.statusFieldMapping,
      });

      // Still goes to Backlog because it has dependencies
      expect(status).toBe('Backlog');
      // But no unresolved dependencies
      expect(hasUnresolvedDependencies(task, syncState)).toBe(false);
    });

    it('correctly handles a task with partial dependencies synced', () => {
      const syncState = createSyncState({
        'dep-1': {
          taskmasterId: 'dep-1',
          githubIssueNumber: 1,
          githubIssueUrl: 'https://github.com/org/repo/issues/1',
          syncedAt: '2026-01-21T20:00:00.000Z',
        },
        // dep-2 is NOT synced
      });

      const task = createTask({
        id: 'dependent-task',
        title: 'Dependent Feature',
        dependencies: ['dep-1', 'dep-2'],
      });
      const config = createConfig();

      const status = determineInitialStatus({
        task,
        syncState,
        statusMapping: config.statusFieldMapping,
      });

      expect(status).toBe('Backlog');
      expect(hasUnresolvedDependencies(task, syncState)).toBe(true);
    });
  });
});
