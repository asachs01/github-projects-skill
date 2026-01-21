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
