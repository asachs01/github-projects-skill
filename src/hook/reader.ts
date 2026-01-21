import * as fs from 'node:fs';
import * as path from 'node:path';
import { TasksFileSchema, TaskmasterTask, TasksFile } from './types.js';

/**
 * Default path to Taskmaster tasks file
 */
export const DEFAULT_TASKS_PATH = '.taskmaster/tasks/tasks.json';

/**
 * Read and parse the Taskmaster tasks.json file
 *
 * @param tasksPath - Path to the tasks.json file (relative to cwd or absolute)
 * @returns Parsed tasks file
 * @throws Error if file doesn't exist or is invalid
 */
export function readTasksFile(tasksPath: string = DEFAULT_TASKS_PATH): TasksFile {
  const absolutePath = path.isAbsolute(tasksPath)
    ? tasksPath
    : path.resolve(process.cwd(), tasksPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Tasks file not found: ${absolutePath}`);
  }

  const content = fs.readFileSync(absolutePath, 'utf-8');

  try {
    const parsed = JSON.parse(content);
    return TasksFileSchema.parse(parsed);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in tasks file: ${error.message}`);
    }
    throw new Error(`Invalid tasks file format: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get all tasks from the tasks file
 *
 * @param tasksPath - Path to the tasks.json file
 * @returns Array of all tasks
 */
export function getAllTasks(tasksPath: string = DEFAULT_TASKS_PATH): TaskmasterTask[] {
  const tasksFile = readTasksFile(tasksPath);
  return tasksFile.master.tasks;
}

/**
 * Get tasks filtered by status
 *
 * @param status - Status to filter by
 * @param tasksPath - Path to the tasks.json file
 * @returns Array of tasks with the specified status
 */
export function getTasksByStatus(
  status: TaskmasterTask['status'],
  tasksPath: string = DEFAULT_TASKS_PATH
): TaskmasterTask[] {
  return getAllTasks(tasksPath).filter(task => task.status === status);
}

/**
 * Get a single task by ID
 *
 * @param taskId - ID of the task to find
 * @param tasksPath - Path to the tasks.json file
 * @returns The task if found, undefined otherwise
 */
export function getTaskById(
  taskId: string,
  tasksPath: string = DEFAULT_TASKS_PATH
): TaskmasterTask | undefined {
  return getAllTasks(tasksPath).find(task => task.id === taskId);
}

/**
 * Get tasks that need to be synced (not done)
 *
 * @param tasksPath - Path to the tasks.json file
 * @returns Array of tasks that should be synced
 */
export function getTasksToSync(tasksPath: string = DEFAULT_TASKS_PATH): TaskmasterTask[] {
  // Return all tasks regardless of status - we sync everything to GitHub
  // Status filtering for sync decisions should happen in the sync logic
  return getAllTasks(tasksPath);
}

/**
 * Get pending tasks (not started)
 *
 * @param tasksPath - Path to the tasks.json file
 * @returns Array of pending tasks
 */
export function getPendingTasks(tasksPath: string = DEFAULT_TASKS_PATH): TaskmasterTask[] {
  return getTasksByStatus('pending', tasksPath);
}

/**
 * Get in-progress tasks
 *
 * @param tasksPath - Path to the tasks.json file
 * @returns Array of in-progress tasks
 */
export function getInProgressTasks(tasksPath: string = DEFAULT_TASKS_PATH): TaskmasterTask[] {
  return getTasksByStatus('in-progress', tasksPath);
}

/**
 * Get done tasks
 *
 * @param tasksPath - Path to the tasks.json file
 * @returns Array of done tasks
 */
export function getDoneTasks(tasksPath: string = DEFAULT_TASKS_PATH): TaskmasterTask[] {
  return getTasksByStatus('done', tasksPath);
}
