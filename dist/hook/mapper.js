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
/**
 * Map a Taskmaster priority to a GitHub priority label
 */
export function mapPriorityToLabel(priority) {
    const labelMap = {
        high: 'priority:high',
        medium: 'priority:medium',
        low: 'priority:low',
    };
    return labelMap[priority];
}
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
export function formatIssueBody(task, resolvedDeps, unresolvedDeps) {
    const sections = [];
    // Description section
    sections.push('## Description');
    sections.push(task.description);
    sections.push('');
    // Implementation Details section (only if details exist)
    if (task.details && task.details.trim()) {
        sections.push('## Implementation Details');
        sections.push(task.details);
        sections.push('');
    }
    // Dependencies section (only if there are dependencies)
    if (resolvedDeps.length > 0 || unresolvedDeps.length > 0) {
        sections.push('## Dependencies');
        for (const dep of resolvedDeps) {
            sections.push(`- Depends on #${dep.issueNumber}`);
        }
        for (const taskId of unresolvedDeps) {
            sections.push(`- Depends on Taskmaster task #${taskId} (not yet synced)`);
        }
        sections.push('');
    }
    // Test Strategy section (only if testStrategy exists)
    if (task.testStrategy && task.testStrategy.trim()) {
        sections.push('## Test Strategy');
        sections.push(task.testStrategy);
        sections.push('');
    }
    // Footer
    sections.push('---');
    sections.push(`*Synced from Taskmaster task #${task.id}*`);
    return sections.join('\n');
}
/**
 * Resolve task dependencies to GitHub issue numbers
 *
 * @param dependencies - Array of Taskmaster task IDs
 * @param syncState - Current sync state
 * @returns Object with resolved and unresolved dependencies
 */
export function resolveDependencies(dependencies, syncState) {
    const resolved = [];
    const unresolved = [];
    for (const taskId of dependencies) {
        if (syncState && taskId in syncState.taskMappings) {
            const mapping = syncState.taskMappings[taskId];
            resolved.push({ taskId, issueNumber: mapping.githubIssueNumber });
        }
        else {
            unresolved.push(taskId);
        }
    }
    return { resolved, unresolved };
}
/**
 * Map a single Taskmaster task to GitHub issue input
 *
 * @param task - The Taskmaster task to map
 * @param options - Mapping options including owner, repo, and sync state
 * @returns MappedIssue containing the issue input and metadata
 */
export function mapTaskToIssue(task, options) {
    const { owner, repo, syncState } = options;
    // Resolve dependencies
    const { resolved, unresolved } = resolveDependencies(task.dependencies, syncState);
    // Map priority to label
    const priorityLabel = mapPriorityToLabel(task.priority);
    // Format the issue body
    const body = formatIssueBody(task, resolved, unresolved);
    // Create the issue input
    const issueInput = {
        owner,
        repo,
        title: task.title,
        body,
        labels: [priorityLabel],
    };
    return {
        issueInput,
        taskId: task.id,
        priorityLabel,
        resolvedDependencies: resolved,
        unresolvedDependencies: unresolved,
    };
}
/**
 * Map multiple Taskmaster tasks to GitHub issue inputs
 *
 * @param tasks - Array of Taskmaster tasks to map
 * @param options - Mapping options including owner, repo, and sync state
 * @returns Array of MappedIssue results
 */
export function mapTasksToIssues(tasks, options) {
    return tasks.map((task) => mapTaskToIssue(task, options));
}
/**
 * Filter out tasks that have already been synced
 *
 * @param tasks - Array of Taskmaster tasks
 * @param syncState - Current sync state
 * @returns Tasks that have not been synced yet
 */
export function filterUnsyncedTasks(tasks, syncState) {
    return tasks.filter((task) => !(task.id in syncState.taskMappings));
}
//# sourceMappingURL=mapper.js.map