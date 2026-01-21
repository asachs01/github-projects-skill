/**
 * Status updater service for managing project item statuses
 * Supports natural language queries like "move API docs to done"
 */

import { GitHubClient, GitHubClientError } from '../github/client.js';
import type { ProjectItem, ProjectContext } from '../github/types.js';
import {
  findBestMatch,
  findMatches,
  getSuggestions,
  DEFAULT_MIN_SCORE,
} from './matcher.js';
import {
  type StatusUpdateRequest,
  type StatusUpdateResult,
  type StatusUpdaterOptions,
  type StatusUpdateConfig,
  type StatusAliasMap,
  DEFAULT_STATUS_ALIASES,
  ItemNotFoundError,
  AmbiguousMatchError,
  InvalidStatusError,
} from './types.js';

/**
 * Score threshold for considering a match ambiguous
 * If top two matches are within this difference, it's ambiguous
 */
const AMBIGUITY_THRESHOLD = 0.05;

/**
 * Maximum number of ambiguous matches to report
 */
const MAX_AMBIGUOUS_MATCHES = 5;

/**
 * Service for updating project item statuses with fuzzy matching
 */
export class StatusUpdater {
  private client: GitHubClient;
  private minMatchScore: number;
  private statusAliases: StatusAliasMap;

  constructor(options: StatusUpdaterOptions) {
    this.client = new GitHubClient({ token: options.token });
    this.minMatchScore = options.minMatchScore ?? DEFAULT_MIN_SCORE;
    this.statusAliases = new Map(DEFAULT_STATUS_ALIASES);
  }

  /**
   * Parse a natural language update request
   *
   * Examples:
   * - "move API docs to done"
   * - "set PDF extraction as blocked - waiting on design review"
   * - "mark #12 as in progress"
   */
  parseRequest(input: string): StatusUpdateRequest {
    const normalizedInput = input.toLowerCase().trim();

    // Check for blocked pattern with reason
    // Pattern: "... blocked - reason" or "... blocked: reason"
    const blockedWithReasonMatch = normalizedInput.match(
      /^(?:move|set|mark|change)?\s*(.+?)\s+(?:to|as|is)?\s*blocked\s*[-:]\s*(.+)$/i
    );

    if (blockedWithReasonMatch) {
      return {
        query: blockedWithReasonMatch[1].trim(),
        targetStatus: 'blocked',
        blockedReason: blockedWithReasonMatch[2].trim(),
        isBlocked: true,
      };
    }

    // Pattern: "move X to Y" or "set X as Y" or "mark X as Y"
    const standardMatch = normalizedInput.match(
      /^(?:move|set|mark|change)?\s*(.+?)\s+(?:to|as|is)\s+(.+)$/i
    );

    if (standardMatch) {
      const query = standardMatch[1].trim();
      const targetStatus = standardMatch[2].trim();
      const isBlocked = this.isBlockedStatus(targetStatus);

      return {
        query,
        targetStatus,
        isBlocked,
      };
    }

    // Simple pattern: "X done" or "X in progress"
    const simpleMatch = normalizedInput.match(
      /^(.+?)\s+(done|todo|in\s*progress|completed?|blocked|backlog)$/i
    );

    if (simpleMatch) {
      const targetStatus = simpleMatch[2].trim();
      return {
        query: simpleMatch[1].trim(),
        targetStatus,
        isBlocked: this.isBlockedStatus(targetStatus),
      };
    }

    // Fallback: try to extract anything meaningful
    throw new Error(
      `Could not parse update request: "${input}". ` +
      `Expected format: "move [task] to [status]" or "set [task] as [status]"`
    );
  }

  /**
   * Check if a status string represents a blocked status
   */
  private isBlockedStatus(status: string): boolean {
    const normalized = status.toLowerCase().trim();
    return ['blocked', 'on hold', 'waiting', 'paused'].includes(normalized);
  }

  /**
   * Resolve a natural language status to an actual project status
   */
  resolveStatus(
    input: string,
    availableStatuses: Map<string, string>
  ): { status: string; optionId: string } | null {
    const normalized = input.toLowerCase().trim();

    // First check for direct match
    const directMatch = availableStatuses.get(normalized);
    if (directMatch) {
      return { status: normalized, optionId: directMatch };
    }

    // Check status aliases
    const aliasedStatus = this.statusAliases.get(normalized);
    if (aliasedStatus) {
      const aliasMatch = availableStatuses.get(aliasedStatus);
      if (aliasMatch) {
        return { status: aliasedStatus, optionId: aliasMatch };
      }
    }

    // Try fuzzy matching on available status names
    for (const [statusName, optionId] of availableStatuses) {
      // Check if input contains the status name or vice versa
      if (normalized.includes(statusName) || statusName.includes(normalized)) {
        return { status: statusName, optionId };
      }
    }

    return null;
  }

  /**
   * Get the current status of a project item
   */
  getCurrentStatus(item: ProjectItem): string | undefined {
    const statusField = item.fieldValues.nodes.find(
      fv => 'name' in fv && fv.field?.name === 'Status'
    );

    if (statusField && 'name' in statusField) {
      return statusField.name;
    }

    return undefined;
  }

  /**
   * Update the status of a project item by fuzzy matching its title
   */
  async updateStatus(
    request: StatusUpdateRequest,
    config: StatusUpdateConfig
  ): Promise<StatusUpdateResult> {
    const { org, projectNumber, isOrg = true } = config;

    // Get project context (includes status field info)
    const projectContext = await this.client.getProject(org, projectNumber, isOrg);

    // Fetch all project items
    const items = await this.client.getProjectItems(projectContext.projectId);

    // Find matching item
    const matches = findMatches(items, request.query, this.minMatchScore);

    if (matches.length === 0) {
      const suggestions = getSuggestions(items, request.query);
      throw new ItemNotFoundError(request.query, suggestions);
    }

    // Check for ambiguous matches
    if (matches.length > 1) {
      const scoreDiff = matches[0].score - matches[1].score;
      if (scoreDiff < AMBIGUITY_THRESHOLD && matches[0].score < 0.9) {
        const ambiguousMatches = matches
          .slice(0, MAX_AMBIGUOUS_MATCHES)
          .map(m => ({
            title: m.title,
            number: m.number,
            score: m.score,
          }));
        throw new AmbiguousMatchError(request.query, ambiguousMatches);
      }
    }

    const bestMatch = matches[0];

    // Resolve target status
    const resolvedStatus = this.resolveStatus(
      request.targetStatus,
      projectContext.statusOptions
    );

    if (!resolvedStatus) {
      const availableStatuses = Array.from(projectContext.statusOptions.keys());
      throw new InvalidStatusError(request.targetStatus, availableStatuses);
    }

    // Get current status for comparison
    const previousStatus = this.getCurrentStatus(bestMatch.item);

    // Update the item status
    await this.client.updateItemStatus(
      projectContext.projectId,
      bestMatch.item.id,
      projectContext.statusFieldId,
      resolvedStatus.optionId
    );

    const result: StatusUpdateResult = {
      success: true,
      itemId: bestMatch.item.id,
      title: bestMatch.title,
      number: bestMatch.number,
      newStatus: resolvedStatus.status,
      previousStatus,
      matchScore: bestMatch.score,
    };

    // Add blocked reason message if applicable
    if (request.isBlocked && request.blockedReason) {
      result.message = `Blocked: ${request.blockedReason}`;
    }

    return result;
  }

  /**
   * Convenience method: parse and execute a natural language update
   */
  async processUpdate(
    input: string,
    config: StatusUpdateConfig
  ): Promise<StatusUpdateResult> {
    const request = this.parseRequest(input);
    return this.updateStatus(request, config);
  }

  /**
   * Add custom status aliases
   */
  addStatusAlias(alias: string, targetStatus: string): void {
    this.statusAliases.set(alias.toLowerCase(), targetStatus.toLowerCase());
  }

  /**
   * Remove a custom status alias
   */
  removeStatusAlias(alias: string): boolean {
    return this.statusAliases.delete(alias.toLowerCase());
  }

  /**
   * Get the underlying GitHub client
   */
  getGitHubClient(): GitHubClient {
    return this.client;
  }

  /**
   * Clear the project cache
   */
  clearCache(): void {
    this.client.clearCache();
  }
}

/**
 * Create a status updater instance
 */
export function createStatusUpdater(token: string): StatusUpdater {
  if (!token) {
    throw new GitHubClientError('GitHub token is required');
  }
  return new StatusUpdater({ token });
}
