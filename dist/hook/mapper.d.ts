/**
 * Mapper for converting Taskmaster tasks to GitHub issue format
 *
 * Maps Taskmaster task fields to GitHub issue fields per the PRD specification:
 * - title -> issue title
 * - description + details -> issue body
 * - priority -> labels (priority:high, priority:medium, priority:low)
 * - dependencies -> body text "Depends on #X"
 * - testStrategy -> formatted section in body
 */
import type { TaskmasterTask, SyncState } from './types.js';
import type { CreateIssueInput } from '../issues/types.js';
/**
 * Options for mapping a task to an issue
 */
export interface MapperOptions {
    /** Repository owner (user or org) */
    owner: string;
    /** Repository name */
    repo: string;
    /** Current sync state for resolving dependency issue numbers */
    syncState?: SyncState;
}
/**
 * Result of mapping a Taskmaster task to GitHub issue input
 */
export interface MappedIssue {
    /** The CreateIssueInput ready for the IssueService */
    issueInput: CreateIssueInput;
    /** Original Taskmaster task ID */
    taskId: string;
    /** Priority label applied */
    priorityLabel: string;
    /** Dependency task IDs that were resolved to issue numbers */
    resolvedDependencies: Array<{
        taskId: string;
        issueNumber: number;
    }>;
    /** Dependency task IDs that could not be resolved (not yet synced) */
    unresolvedDependencies: string[];
}
/**
 * Map a Taskmaster priority to a GitHub priority label
 */
export declare function mapPriorityToLabel(priority: TaskmasterTask['priority']): string;
/**
 * Format the issue body from task fields
 *
 * Body format:
 * ## Description
 * [task description]
 *
 * ## Implementation Details
 * [task details]
 *
 * ## Dependencies
 * - Depends on #X
 * - Depends on #Y
 *
 * ## Test Strategy
 * [testStrategy content]
 *
 * ---
 * *Synced from Taskmaster task #[id]*
 */
export declare function formatIssueBody(task: TaskmasterTask, resolvedDeps: Array<{
    taskId: string;
    issueNumber: number;
}>, unresolvedDeps: string[]): string;
/**
 * Resolve task dependencies to GitHub issue numbers
 *
 * @param dependencies - Array of Taskmaster task IDs
 * @param syncState - Current sync state
 * @returns Object with resolved and unresolved dependencies
 */
export declare function resolveDependencies(dependencies: string[], syncState?: SyncState): {
    resolved: Array<{
        taskId: string;
        issueNumber: number;
    }>;
    unresolved: string[];
};
/**
 * Map a single Taskmaster task to GitHub issue input
 *
 * @param task - The Taskmaster task to map
 * @param options - Mapping options including owner, repo, and sync state
 * @returns MappedIssue containing the issue input and metadata
 */
export declare function mapTaskToIssue(task: TaskmasterTask, options: MapperOptions): MappedIssue;
/**
 * Map multiple Taskmaster tasks to GitHub issue inputs
 *
 * @param tasks - Array of Taskmaster tasks to map
 * @param options - Mapping options including owner, repo, and sync state
 * @returns Array of MappedIssue results
 */
export declare function mapTasksToIssues(tasks: TaskmasterTask[], options: MapperOptions): MappedIssue[];
/**
 * Filter out tasks that have already been synced
 *
 * @param tasks - Array of Taskmaster tasks
 * @param syncState - Current sync state
 * @returns Tasks that have not been synced yet
 */
export declare function filterUnsyncedTasks(tasks: TaskmasterTask[], syncState: SyncState): TaskmasterTask[];
//# sourceMappingURL=mapper.d.ts.map