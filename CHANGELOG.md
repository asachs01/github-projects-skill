# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Robust sync state management with idempotency support
  - Atomic file writes using temp file + rename pattern to prevent corruption
  - Lock file mechanism for concurrent access protection (`acquireLock()`, `releaseLock()`)
  - `writeSyncStateWithLock()` for thread-safe state updates
  - `updateSyncStateWithLock()` for atomic read-modify-write operations
- Cleanup and maintenance functions for sync state
  - `cleanupStaleEntries()` to remove mappings for deleted tasks
  - `cleanupStaleEntriesFromFile()` convenience wrapper with file I/O
  - `cleanupStaleEntriesWithLock()` for concurrent access safety
  - `verifyStateIntegrity()` to detect orphaned or inconsistent entries
- Convenience wrapper functions for simpler sync state API
  - `isSynced(taskId)` - Check if a task has been synced
  - `markSynced(taskId, issueNumber, url)` - Record a sync with file I/O
  - `markSyncedWithLock()` - Thread-safe version of markSynced
  - `getMapping(taskId)` - Get GitHub mapping for a task
- Sync idempotency verification
  - `verifySyncIdempotency()` - Check if running sync would create duplicates
  - Double-check idempotency within `syncTask()` to prevent race conditions
- New sync options for robust operation
  - `useLocking` - Enable file locking for concurrent access
  - `cleanupStale` - Remove stale entries before syncing
  - `saveAfterEachTask` - Save state after each task for partial failure recovery
- Extended `ExtendedSyncSummary` with `staleEntriesRemoved` and `skippedDueToDuplicateCheck` fields
- Comprehensive idempotency tests (60 total tests in hook.test.ts)

- Cross-project aggregated queries for GitHub Projects
  - `queryBlockedItems()` - Get all blocked items across configured projects with "what's blocking?" query support
  - `queryStandupSummary()` - Daily standup summary showing in-progress, blocked, and done this week counts per project
  - `queryOpenCount()` - Total open issues count across all projects
- Formatting functions for human-readable output
  - `formatBlockedItemsResponse()` - Format blocked items for display
  - `formatStandupSummaryResponse()` - Format standup summary for display
  - `formatOpenCountResponse()` - Format open counts for display
- New aggregation types in `src/queries/types.ts`
  - `BlockedItem`, `BlockedItemsResponse`
  - `ProjectStandupSummary`, `StandupSummaryResponse`
  - `OpenCountResponse`, `AggregatedQueryOptions`
- Comprehensive test suite for aggregated queries
- Parallel API calls using `Promise.all()` for performance optimization
- Timeout and error handling options for aggregated queries
- Project board integration module (`src/hook/project-board.ts`) for automatically adding issues to GitHub project boards with appropriate initial status
  - Dependency-based status detection: issues with no dependencies are set to "Ready", issues with dependencies are set to "Backlog"
  - `determineInitialStatus()` function to calculate initial status based on task dependencies
  - `hasUnresolvedDependencies()` function to check if a task has dependencies that haven't been synced yet
  - `selectProjectForRepo()` function to find the appropriate project for a given repository
  - `addIssueToProjectBoard()` function for adding issues to project boards with status setting
  - `batchAddIssuesToProjectBoard()` function for batch processing multiple issues
- New `autoDetectStatus` option in `SyncOptions` to enable automatic status detection based on task dependencies
- New types: `ProjectItemStatus`, `ProjectBoardAddResult`, `ExtendedTaskMapping`
- Comprehensive test suite for project board integration (23 tests)

### Changed

- Enhanced `TaskSyncResult` to include `initialStatus` and `hadUnresolvedDependencies` fields
- Updated `sync.ts` to support automatic dependency-based status detection when adding issues to projects
- Extended `hook/index.ts` exports to include all project board integration functions and types
