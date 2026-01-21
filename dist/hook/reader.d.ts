import { TaskmasterTask, TasksFile } from './types.js';
/**
 * Default path to Taskmaster tasks file
 */
export declare const DEFAULT_TASKS_PATH = ".taskmaster/tasks/tasks.json";
/**
 * Read and parse the Taskmaster tasks.json file
 *
 * @param tasksPath - Path to the tasks.json file (relative to cwd or absolute)
 * @returns Parsed tasks file
 * @throws Error if file doesn't exist or is invalid
 */
export declare function readTasksFile(tasksPath?: string): TasksFile;
/**
 * Get all tasks from the tasks file
 *
 * @param tasksPath - Path to the tasks.json file
 * @returns Array of all tasks
 */
export declare function getAllTasks(tasksPath?: string): TaskmasterTask[];
/**
 * Get tasks filtered by status
 *
 * @param status - Status to filter by
 * @param tasksPath - Path to the tasks.json file
 * @returns Array of tasks with the specified status
 */
export declare function getTasksByStatus(status: TaskmasterTask['status'], tasksPath?: string): TaskmasterTask[];
/**
 * Get a single task by ID
 *
 * @param taskId - ID of the task to find
 * @param tasksPath - Path to the tasks.json file
 * @returns The task if found, undefined otherwise
 */
export declare function getTaskById(taskId: string, tasksPath?: string): TaskmasterTask | undefined;
/**
 * Get tasks that need to be synced (not done)
 *
 * @param tasksPath - Path to the tasks.json file
 * @returns Array of tasks that should be synced
 */
export declare function getTasksToSync(tasksPath?: string): TaskmasterTask[];
/**
 * Get pending tasks (not started)
 *
 * @param tasksPath - Path to the tasks.json file
 * @returns Array of pending tasks
 */
export declare function getPendingTasks(tasksPath?: string): TaskmasterTask[];
/**
 * Get in-progress tasks
 *
 * @param tasksPath - Path to the tasks.json file
 * @returns Array of in-progress tasks
 */
export declare function getInProgressTasks(tasksPath?: string): TaskmasterTask[];
/**
 * Get done tasks
 *
 * @param tasksPath - Path to the tasks.json file
 * @returns Array of done tasks
 */
export declare function getDoneTasks(tasksPath?: string): TaskmasterTask[];
//# sourceMappingURL=reader.d.ts.map