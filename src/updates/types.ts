/**
 * Types for project item status updates
 */

import type { ProjectItem, ProjectContext } from '../github/types.js';

/**
 * Parsed update request from natural language input
 */
export interface StatusUpdateRequest {
  /** The search query to find the item (title, partial title, or issue number) */
  query: string;
  /** The target status to set */
  targetStatus: string;
  /** Optional blocked reason when setting blocked status */
  blockedReason?: string;
  /** Whether this is a blocked status update */
  isBlocked: boolean;
}

/**
 * Match result from fuzzy title matching
 */
export interface MatchResult {
  /** The matched project item */
  item: ProjectItem;
  /** Match score (0-1, higher is better) */
  score: number;
  /** The matched title */
  title: string;
  /** Issue or PR number */
  number: number;
}

/**
 * Result of a status update operation
 */
export interface StatusUpdateResult {
  /** Whether the update was successful */
  success: boolean;
  /** The updated item ID */
  itemId: string;
  /** The item title */
  title: string;
  /** The item number */
  number: number;
  /** The new status that was set */
  newStatus: string;
  /** The previous status (if known) */
  previousStatus?: string;
  /** Match score for the selected item */
  matchScore: number;
  /** Optional message with additional details */
  message?: string;
}

/**
 * Options for the status updater
 */
export interface StatusUpdaterOptions {
  /** GitHub API token */
  token: string;
  /** Minimum match score threshold (0-1) */
  minMatchScore?: number;
}

/**
 * Configuration for status update operation
 */
export interface StatusUpdateConfig {
  /** Organization or user login */
  org: string;
  /** Project number */
  projectNumber: number;
  /** Whether this is an organization project (vs user project) */
  isOrg?: boolean;
}

/**
 * Status alias mapping - maps common natural language terms to status values
 */
export type StatusAliasMap = Map<string, string>;

/**
 * Default status aliases for common project workflows
 */
export const DEFAULT_STATUS_ALIASES: ReadonlyMap<string, string> = new Map([
  // Todo variants
  ['todo', 'todo'],
  ['to do', 'todo'],
  ['backlog', 'todo'],
  ['new', 'todo'],
  ['open', 'todo'],
  ['not started', 'todo'],

  // In progress variants
  ['in progress', 'in progress'],
  ['in-progress', 'in progress'],
  ['inprogress', 'in progress'],
  ['started', 'in progress'],
  ['working', 'in progress'],
  ['active', 'in progress'],
  ['doing', 'in progress'],
  ['wip', 'in progress'],

  // Done variants
  ['done', 'done'],
  ['complete', 'done'],
  ['completed', 'done'],
  ['finished', 'done'],
  ['closed', 'done'],
  ['resolved', 'done'],

  // Blocked variants (these are handled specially but need status mapping)
  ['blocked', 'blocked'],
  ['on hold', 'blocked'],
  ['waiting', 'blocked'],
  ['paused', 'blocked'],
]);

/**
 * Error thrown when no matching item is found
 */
export class ItemNotFoundError extends Error {
  constructor(
    public readonly query: string,
    public readonly suggestions?: string[]
  ) {
    const message = suggestions && suggestions.length > 0
      ? `No item found matching "${query}". Did you mean: ${suggestions.join(', ')}?`
      : `No item found matching "${query}"`;
    super(message);
    this.name = 'ItemNotFoundError';
  }
}

/**
 * Error thrown when multiple items match ambiguously
 */
export class AmbiguousMatchError extends Error {
  constructor(
    public readonly query: string,
    public readonly matches: Array<{ title: string; number: number; score: number }>
  ) {
    const matchList = matches.map(m => `#${m.number}: ${m.title}`).join(', ');
    super(`Multiple items match "${query}": ${matchList}. Please be more specific.`);
    this.name = 'AmbiguousMatchError';
  }
}

/**
 * Error thrown when the target status is not valid for the project
 */
export class InvalidStatusError extends Error {
  constructor(
    public readonly status: string,
    public readonly availableStatuses: string[]
  ) {
    super(`Status "${status}" is not valid. Available statuses: ${availableStatuses.join(', ')}`);
    this.name = 'InvalidStatusError';
  }
}
