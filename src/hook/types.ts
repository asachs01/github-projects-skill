import { z } from 'zod';

/**
 * Taskmaster Task Interface
 * Based on the format from .taskmaster/tasks/tasks.json
 */
export const TaskmasterTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  details: z.string().optional(),
  testStrategy: z.string().optional(),
  priority: z.enum(['high', 'medium', 'low']),
  dependencies: z.array(z.string()).default([]),
  status: z.enum(['pending', 'in-progress', 'done', 'blocked']),
  subtasks: z.array(z.any()).default([]),
  updatedAt: z.string().optional(),
});

export type TaskmasterTask = z.infer<typeof TaskmasterTaskSchema>;

/**
 * Taskmaster tasks.json file structure
 */
export const TasksFileSchema = z.object({
  master: z.object({
    tasks: z.array(TaskmasterTaskSchema),
    metadata: z.object({
      version: z.string(),
      lastModified: z.string(),
      taskCount: z.number(),
      completedCount: z.number(),
      tags: z.array(z.string()),
    }).partial(),
  }),
});

export type TasksFile = z.infer<typeof TasksFileSchema>;

/**
 * Mapping between a Taskmaster task and its GitHub issue
 */
export interface TaskMapping {
  taskmasterId: string;
  githubIssueNumber: number;
  githubIssueUrl: string;
  projectItemId?: string;
  syncedAt: string;
}

/**
 * Sync state for tracking which tasks have been synced
 */
export const SyncStateSchema = z.object({
  lastSyncAt: z.string().optional(),
  taskMappings: z.record(z.string(), z.object({
    taskmasterId: z.string(),
    githubIssueNumber: z.number(),
    githubIssueUrl: z.string(),
    projectItemId: z.string().optional(),
    syncedAt: z.string(),
  })),
  version: z.string().default('1.0.0'),
});

export type SyncState = z.infer<typeof SyncStateSchema>;

/**
 * Result of a sync operation for a single task
 */
export interface SyncResult {
  taskId: string;
  success: boolean;
  issueNumber?: number;
  issueUrl?: string;
  error?: string;
}

/**
 * Summary of a full sync operation
 */
export interface SyncSummary {
  totalTasks: number;
  newlySynced: number;
  alreadySynced: number;
  failed: number;
  results: SyncResult[];
}

/**
 * Project board item status
 */
export type ProjectItemStatus = 'backlog' | 'ready' | 'in_progress' | 'blocked' | 'done';

/**
 * Result of adding an issue to a project board
 */
export interface ProjectBoardAddResult {
  /** The project item ID (from GraphQL) */
  projectItemId: string;
  /** The initial status that was set */
  initialStatus: string;
  /** The project's GraphQL node ID */
  projectId: string;
  /** Whether the task has any unresolved dependencies */
  hasUnresolvedDependencies: boolean;
}

/**
 * Extended task mapping with project board info
 */
export interface ExtendedTaskMapping extends TaskMapping {
  /** Initial status when added to project */
  initialStatus?: string;
  /** Whether the task had unresolved dependencies at sync time */
  hadUnresolvedDependencies?: boolean;
}
