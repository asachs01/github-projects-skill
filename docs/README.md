# Taskmaster Hook Documentation

The Taskmaster Hook component syncs tasks from Taskmaster's `tasks.json` to GitHub Issues, automatically adding them to your GitHub Project board with appropriate status.

## Overview

When you use Taskmaster to manage your project tasks, this hook bridges the gap between local task management and GitHub's project tracking. Tasks become issues, get added to your project board, and are set to the appropriate status column based on their dependencies.

## Features

- **Idempotent Sync**: Running sync multiple times won't create duplicates
- **Dependency-Based Status**: Tasks with dependencies start in "Backlog", others in "Ready"
- **Project Board Integration**: Issues are automatically added to your GitHub Project
- **State Tracking**: Maintains mapping between Taskmaster task IDs and GitHub issue numbers
- **Concurrent Access Safety**: File locking prevents race conditions
- **Stale Entry Cleanup**: Removes mappings for deleted tasks

## Quick Start

### 1. Set Environment Variables

```bash
export GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export GITHUB_OWNER="your-username-or-org"
export GITHUB_REPO="your-repository"
export GITHUB_PROJECT_ID="PVT_kwHOxxxxxx"  # Optional: for project board integration
```

### 2. Run the Sync Command

```bash
npm run sync-tasks
```

### 3. Dry Run (Preview)

To preview what would be synced without creating issues:

```bash
DRY_RUN=true npm run sync-tasks
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Yes | GitHub Personal Access Token with `repo` and `project` scopes |
| `GITHUB_OWNER` | Yes | Repository owner (username or organization) |
| `GITHUB_REPO` | Yes | Repository name |
| `GITHUB_PROJECT_ID` | No | Project node ID for adding issues to a project board |
| `DRY_RUN` | No | Set to `true` to preview sync without creating issues |

## File Paths

The hook uses these default file paths:

| File | Default Path | Description |
|------|--------------|-------------|
| Tasks | `.taskmaster/tasks/tasks.json` | Taskmaster task definitions |
| Sync State | `.taskmaster/sync-state.json` | Mapping of synced tasks to issues |

## Programmatic Usage

### Basic Sync

```typescript
import { syncTasks } from 'github-projects-skill/hook';

const summary = await syncTasks({
  token: process.env.GITHUB_TOKEN,
  owner: 'your-org',
  repo: 'your-repo',
});

console.log(`Synced ${summary.newlySynced} new tasks`);
console.log(`Already synced: ${summary.alreadySynced}`);
console.log(`Failed: ${summary.failed}`);
```

### Sync with Project Board

```typescript
import { syncTasks } from 'github-projects-skill/hook';

const summary = await syncTasks({
  token: process.env.GITHUB_TOKEN,
  owner: 'your-org',
  repo: 'your-repo',
  projectId: 'PVT_kwHOxxxxxx',
  org: 'your-org',
  projectNumber: 1,
  isOrg: true,
  autoDetectStatus: true,
  config: yourNormalizedConfig,
});
```

### Sync Options

```typescript
interface SyncOptions {
  // Required
  token: string;           // GitHub token
  owner: string;           // Repo owner
  repo: string;            // Repo name

  // File paths (optional)
  tasksPath?: string;      // Path to tasks.json
  statePath?: string;      // Path to sync-state.json

  // Project integration (optional)
  projectId?: string;      // Project node ID
  org?: string;            // Organization name
  projectNumber?: number;  // Project number
  isOrg?: boolean;         // Is organization project (default: true)
  initialStatus?: string;  // Explicit initial status
  autoDetectStatus?: boolean; // Auto-detect based on dependencies
  config?: NormalizedConfig;  // Full config for status mapping

  // Behavior options
  dryRun?: boolean;        // Preview without creating issues
  useLocking?: boolean;    // Enable file locking
  cleanupStale?: boolean;  // Remove stale entries first
  saveAfterEachTask?: boolean; // Save state after each task
}
```

## Sync State File

The sync state file (`sync-state.json`) tracks which tasks have been synced:

```json
{
  "version": 1,
  "lastSyncedAt": "2024-01-15T10:30:00.000Z",
  "taskMappings": {
    "task-1": {
      "taskmasterId": "task-1",
      "githubIssueNumber": 42,
      "githubIssueUrl": "https://github.com/owner/repo/issues/42",
      "projectItemId": "PVTI_xxxxx",
      "syncedAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

## Helper Functions

### Check if Task is Synced

```typescript
import { isSynced, getMapping } from 'github-projects-skill/hook';

if (isSynced('task-1')) {
  const mapping = getMapping('task-1');
  console.log(`Task synced as issue #${mapping.githubIssueNumber}`);
}
```

### Mark Task as Synced

```typescript
import { markSynced } from 'github-projects-skill/hook';

await markSynced('task-1', 42, 'https://github.com/owner/repo/issues/42');
```

### Verify Idempotency

```typescript
import { verifySyncIdempotency } from 'github-projects-skill/hook';

const check = verifySyncIdempotency({});
console.log(`Is idempotent: ${check.isIdempotent}`);
console.log(`Unsynced tasks: ${check.unsyncedTaskIds.join(', ')}`);
```

### Cleanup Stale Entries

```typescript
import { cleanupStaleEntriesWithLock } from 'github-projects-skill/hook';

const result = await cleanupStaleEntriesWithLock();
console.log(`Removed ${result.removedCount} stale entries`);
```

## Dependency-Based Status Detection

When `autoDetectStatus` is enabled, the hook determines initial status based on task dependencies:

- **Tasks with unresolved dependencies** -> "Backlog" status
- **Tasks with no dependencies or all resolved** -> "Ready" status

A dependency is considered "resolved" when the corresponding task has been synced to GitHub.

```typescript
import { determineInitialStatus, hasUnresolvedDependencies } from 'github-projects-skill/hook';

const status = determineInitialStatus({
  task,
  syncState,
  statusMapping: config.statusFieldMapping,
});

const hasBlocking = hasUnresolvedDependencies(task, syncState);
```

## Error Handling

The sync operation continues on individual task failures by default:

```typescript
const summary = await syncTasks(options);

if (summary.failed > 0) {
  for (const result of summary.results) {
    if (!result.success) {
      console.error(`Task ${result.taskId} failed: ${result.error}`);
    }
  }
}
```

## Concurrent Access

For environments where multiple processes might sync simultaneously:

```typescript
const summary = await syncTasks({
  ...options,
  useLocking: true,
  saveAfterEachTask: true, // Recover from partial failures
});
```

The lock file mechanism prevents concurrent modifications to the sync state.

## Troubleshooting

See [troubleshooting.md](troubleshooting.md) for common issues and solutions.
