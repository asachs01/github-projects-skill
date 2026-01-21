/**
 * Types for project status query responses
 */

import type { ProjectItem } from '../github/types.js';

/**
 * A summarized item for display in status responses
 */
export interface StatusItem {
  /** Issue/PR number */
  number: number;
  /** Issue/PR title */
  title: string;
  /** URL to the issue/PR */
  url: string;
  /** Optional note (e.g., "waiting on design review") */
  note?: string;
}

/**
 * A category of items grouped by status
 */
export interface StatusCategory {
  /** Display name for this category (e.g., "In Progress", "Blocked") */
  name: string;
  /** Number of items in this category */
  count: number;
  /** Top items in this category (limited to maxItems) */
  items: StatusItem[];
  /** Whether there are more items than shown */
  hasMore: boolean;
}

/**
 * Complete status response for a project
 */
export interface ProjectStatusResponse {
  /** Project name */
  projectName: string;
  /** Whether the query was successful */
  success: boolean;
  /** Error message if unsuccessful */
  error?: string;
  /** Status categories with item counts and samples */
  categories: StatusCategory[];
  /** Total number of items across all categories */
  totalItems: number;
  /** Timestamp when the status was fetched */
  fetchedAt: Date;
}

/**
 * Options for the status query
 */
export interface StatusQueryOptions {
  /** Maximum items to show per category (default: 5) */
  maxItemsPerCategory?: number;
  /** Status categories to include (default: all mapped statuses) */
  includeStatuses?: string[];
  /** Whether to include items completed this week in a separate category */
  includeDoneThisWeek?: boolean;
}

/**
 * Internal representation of items grouped by status
 */
export interface GroupedItems {
  /** Map of status name to items */
  byStatus: Map<string, ProjectItem[]>;
  /** Items completed this week (if tracking) */
  doneThisWeek: ProjectItem[];
}

/**
 * Result of parsing a natural language project query
 */
export interface ParsedProjectQuery {
  /** Extracted project name */
  projectName: string;
  /** Confidence level of the extraction (0-1) */
  confidence: number;
  /** Original query text */
  originalQuery: string;
}

// ============================================================================
// Aggregated Query Types
// ============================================================================

/**
 * A blocked item with project context
 */
export interface BlockedItem {
  /** Issue/PR number */
  number: number;
  /** Issue/PR title */
  title: string;
  /** URL to the issue/PR */
  url: string;
  /** Project name this item belongs to */
  projectName: string;
  /** Reason for being blocked (extracted from labels or notes) */
  reason?: string;
}

/**
 * Response for "what's blocking?" query across all projects
 */
export interface BlockedItemsResponse {
  /** Whether the query was successful */
  success: boolean;
  /** Error message if unsuccessful */
  error?: string;
  /** All blocked items across projects */
  blockedItems: BlockedItem[];
  /** Total count of blocked items */
  totalBlocked: number;
  /** Timestamp when the data was fetched */
  fetchedAt: Date;
}

/**
 * Per-project summary for standup
 */
export interface ProjectStandupSummary {
  /** Project name */
  projectName: string;
  /** Count of items in progress */
  inProgressCount: number;
  /** Count of blocked items */
  blockedCount: number;
  /** Count of items done this week */
  doneThisWeekCount: number;
  /** Whether fetching this project succeeded */
  success: boolean;
  /** Error message if fetching failed */
  error?: string;
}

/**
 * Response for "standup summary" query across all projects
 */
export interface StandupSummaryResponse {
  /** Whether the overall query was successful */
  success: boolean;
  /** Error message if all projects failed */
  error?: string;
  /** Per-project summaries */
  projectSummaries: ProjectStandupSummary[];
  /** Total items in progress across all projects */
  totalInProgress: number;
  /** Total blocked items across all projects */
  totalBlocked: number;
  /** Total items done this week across all projects */
  totalDoneThisWeek: number;
  /** Timestamp when the data was fetched */
  fetchedAt: Date;
}

/**
 * Response for total open issues count across all projects
 */
export interface OpenCountResponse {
  /** Whether the query was successful */
  success: boolean;
  /** Error message if unsuccessful */
  error?: string;
  /** Total open items across all projects */
  totalOpen: number;
  /** Per-project open counts */
  projectCounts: Array<{
    projectName: string;
    openCount: number;
    success: boolean;
    error?: string;
  }>;
  /** Timestamp when the data was fetched */
  fetchedAt: Date;
}

/**
 * Options for aggregated queries
 */
export interface AggregatedQueryOptions {
  /** Maximum time to wait for all projects (ms) */
  timeoutMs?: number;
  /** Whether to continue if some projects fail */
  continueOnError?: boolean;
}
