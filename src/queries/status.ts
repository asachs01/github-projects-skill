/**
 * Status query handler for GitHub Projects
 * Handles natural language queries like "What's the status on [project]?"
 */

import type { GitHubClient } from '../github/client.js';
import type { NormalizedConfig, NormalizedProjectConfig } from '../types/config.js';
import type { ProjectItem, ProjectItemFieldSingleSelectValue, IssueContent } from '../github/types.js';
import type {
  ProjectStatusResponse,
  StatusQueryOptions,
  StatusCategory,
  StatusItem,
  GroupedItems,
  ParsedProjectQuery,
} from './types.js';
import { findProjectByName } from '../config/parser.js';

const DEFAULT_MAX_ITEMS_PER_CATEGORY = 5;
const DAYS_FOR_DONE_THIS_WEEK = 7;

/**
 * Parse a natural language query to extract the project name
 */
export function parseProjectQuery(query: string): ParsedProjectQuery {
  const normalizedQuery = query.trim().toLowerCase();

  // Common patterns for status queries
  const patterns = [
    /what(?:'s| is) the status (?:on|of|for) (?:the )?(?:project )?["']?([^"'?]+)["']?\??/i,
    /status (?:on|of|for) (?:the )?(?:project )?["']?([^"'?]+)["']?\??/i,
    /how(?:'s| is) (?:the )?(?:project )?["']?(.+?)["']?(?: doing| going| progressing)\??/i,
    /(?:show|get|give)(?: me)? (?:the )?status (?:on|of|for) ["']?([^"'?]+)["']?\??/i,
    /["']?([^"'?]+)["']? status\??/i,
  ];

  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      const projectName = match[1].trim();
      return {
        projectName,
        confidence: 0.9,
        originalQuery: query,
      };
    }
  }

  // Fallback: try to extract any capitalized words or quoted strings
  const quotedMatch = query.match(/["']([^"']+)["']/);
  if (quotedMatch) {
    return {
      projectName: quotedMatch[1].trim(),
      confidence: 0.7,
      originalQuery: query,
    };
  }

  // Last resort: find capitalized words that might be project names
  const capitalizedWords = query.match(/\b[A-Z][a-zA-Z0-9-_]+\b/g);
  if (capitalizedWords && capitalizedWords.length > 0) {
    return {
      projectName: capitalizedWords[0],
      confidence: 0.5,
      originalQuery: query,
    };
  }

  return {
    projectName: '',
    confidence: 0,
    originalQuery: query,
  };
}

/**
 * Find a project by name with fuzzy matching
 */
export function findProject(
  config: NormalizedConfig,
  projectName: string
): NormalizedProjectConfig | undefined {
  // Exact match first
  const exactMatch = findProjectByName(config, projectName);
  if (exactMatch) {
    return exactMatch;
  }

  // Fuzzy match: check if project name contains the query or vice versa
  const lowerName = projectName.toLowerCase();
  return config.projects.find((p) => {
    const pLower = p.name.toLowerCase();
    return pLower.includes(lowerName) || lowerName.includes(pLower);
  });
}

/**
 * Get the status field value from a project item
 */
function getItemStatus(item: ProjectItem, statusFieldName: string = 'Status'): string | null {
  const statusField = item.fieldValues.nodes.find(
    (fv): fv is ProjectItemFieldSingleSelectValue =>
      fv.field.name === statusFieldName && 'name' in fv
  );
  return statusField?.name ?? null;
}

/**
 * Check if an item was completed within the last N days
 */
function isCompletedWithinDays(item: ProjectItem, days: number): boolean {
  const content = item.content as IssueContent | null;
  if (!content?.closedAt) {
    return false;
  }

  const closedDate = new Date(content.closedAt);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  return closedDate >= cutoffDate;
}

/**
 * Extract a note from an item (e.g., from labels or assignees)
 */
function extractItemNote(item: ProjectItem): string | undefined {
  const content = item.content as IssueContent | null;
  if (!content) {
    return undefined;
  }

  // Look for blocked labels
  const blockedLabel = content.labels?.nodes?.find((l) =>
    l.name.toLowerCase().startsWith('blocked')
  );
  if (blockedLabel) {
    const reason = blockedLabel.name.replace(/^blocked:?\s*/i, '');
    return reason ? `waiting on ${reason}` : 'blocked';
  }

  return undefined;
}

/**
 * Convert a ProjectItem to a StatusItem for display
 */
function toStatusItem(item: ProjectItem): StatusItem | null {
  const content = item.content;
  if (!content) {
    return null;
  }

  return {
    number: content.number,
    title: content.title,
    url: content.url,
    note: extractItemNote(item),
  };
}

/**
 * Group project items by their status
 */
function groupItemsByStatus(
  items: ProjectItem[],
  statusMapping: Record<string, string>,
  includeDoneThisWeek: boolean
): GroupedItems {
  const byStatus = new Map<string, ProjectItem[]>();
  const doneThisWeek: ProjectItem[] = [];

  // Initialize all status categories from the mapping
  for (const displayName of Object.values(statusMapping)) {
    byStatus.set(displayName, []);
  }

  for (const item of items) {
    const status = getItemStatus(item);
    if (!status) {
      continue;
    }

    // Add to appropriate status group
    const existing = byStatus.get(status) ?? [];
    existing.push(item);
    byStatus.set(status, existing);

    // Track items done this week separately
    if (includeDoneThisWeek && status.toLowerCase().includes('done')) {
      if (isCompletedWithinDays(item, DAYS_FOR_DONE_THIS_WEEK)) {
        doneThisWeek.push(item);
      }
    }
  }

  return { byStatus, doneThisWeek };
}

/**
 * Build status categories from grouped items
 */
function buildCategories(
  grouped: GroupedItems,
  statusMapping: Record<string, string>,
  options: StatusQueryOptions
): StatusCategory[] {
  const maxItems = options.maxItemsPerCategory ?? DEFAULT_MAX_ITEMS_PER_CATEGORY;
  const categories: StatusCategory[] = [];

  // Define display order for statuses
  const statusOrder = ['in_progress', 'blocked', 'ready', 'backlog', 'done'];

  for (const key of statusOrder) {
    const displayName = statusMapping[key];
    if (!displayName) {
      continue;
    }

    // Skip if not in includeStatuses filter
    if (options.includeStatuses && !options.includeStatuses.includes(key)) {
      continue;
    }

    const items = grouped.byStatus.get(displayName) ?? [];
    const statusItems = items
      .slice(0, maxItems)
      .map(toStatusItem)
      .filter((item): item is StatusItem => item !== null);

    categories.push({
      name: displayName,
      count: items.length,
      items: statusItems,
      hasMore: items.length > maxItems,
    });
  }

  // Add "Done this week" category if requested and has items
  if (options.includeDoneThisWeek !== false && grouped.doneThisWeek.length > 0) {
    const doneItems = grouped.doneThisWeek
      .slice(0, maxItems)
      .map(toStatusItem)
      .filter((item): item is StatusItem => item !== null);

    categories.push({
      name: 'Done this week',
      count: grouped.doneThisWeek.length,
      items: doneItems,
      hasMore: grouped.doneThisWeek.length > maxItems,
    });
  }

  return categories;
}

/**
 * Format a status response as a human-readable string
 */
export function formatStatusResponse(response: ProjectStatusResponse): string {
  if (!response.success) {
    return `Unable to get status for ${response.projectName}: ${response.error}`;
  }

  const lines: string[] = [];
  lines.push(`${response.projectName} Status:`);

  for (const category of response.categories) {
    if (category.count === 0) {
      continue;
    }

    const itemSummaries = category.items.map((item) => {
      const base = `${item.title} (#${item.number})`;
      return item.note ? `${base} - ${item.note}` : base;
    });

    const itemList = itemSummaries.join(', ');
    const moreIndicator = category.hasMore ? ' ...' : '';

    lines.push(`- ${category.name} (${category.count}): ${itemList}${moreIndicator}`);
  }

  if (lines.length === 1) {
    lines.push('- No items found in any status category');
  }

  return lines.join('\n');
}

/**
 * Query the status of a project
 */
export async function queryProjectStatus(
  client: GitHubClient,
  config: NormalizedConfig,
  projectName: string,
  options: StatusQueryOptions = {}
): Promise<ProjectStatusResponse> {
  const fetchedAt = new Date();

  // Find the project configuration
  const projectConfig = findProject(config, projectName);
  if (!projectConfig) {
    const availableProjects = config.projects.map((p) => p.name).join(', ');
    return {
      projectName,
      success: false,
      error: `Project "${projectName}" not found. Available projects: ${availableProjects}`,
      categories: [],
      totalItems: 0,
      fetchedAt,
    };
  }

  try {
    // Get project context from GitHub
    const projectContext = await client.getProject(
      projectConfig.org,
      projectConfig.projectNumber,
      true // Try as org first
    );

    // Get all project items
    const items = await client.getProjectItems(projectContext.projectId);

    // Group items by status
    const grouped = groupItemsByStatus(
      items,
      config.statusFieldMapping,
      options.includeDoneThisWeek !== false
    );

    // Build response categories
    const categories = buildCategories(grouped, config.statusFieldMapping, options);

    // Calculate total items
    const totalItems = items.length;

    return {
      projectName: projectConfig.name,
      success: true,
      categories,
      totalItems,
      fetchedAt,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      projectName: projectConfig.name,
      success: false,
      error: errorMessage,
      categories: [],
      totalItems: 0,
      fetchedAt,
    };
  }
}

/**
 * Handle a natural language status query
 */
export async function handleStatusQuery(
  query: string,
  client: GitHubClient,
  config: NormalizedConfig,
  options: StatusQueryOptions = {}
): Promise<ProjectStatusResponse> {
  const parsed = parseProjectQuery(query);

  if (!parsed.projectName || parsed.confidence < 0.3) {
    return {
      projectName: 'Unknown',
      success: false,
      error: `Could not identify a project name from query: "${query}"`,
      categories: [],
      totalItems: 0,
      fetchedAt: new Date(),
    };
  }

  return queryProjectStatus(client, config, parsed.projectName, options);
}
