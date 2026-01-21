/**
 * Time-based status queries for GitHub Projects
 * Handles queries like "what did I ship this week?" and recent completions filtering.
 */

import type { GitHubClient } from '../github/client.js';
import type { NormalizedConfig, NormalizedProjectConfig } from '../types/config.js';
import type { ProjectItem, IssueContent, PullRequestContent, ProjectItemFieldSingleSelectValue } from '../github/types.js';
import type {
  TimeRangePreset,
  TimeRange,
  ParsedTimeQuery,
  ShippedItem,
  ProjectShippedSummary,
  ShippedItemsResponse,
  TimeBasedQueryOptions,
} from './types.js';

const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Parse a time range preset into actual start/end dates
 */
export function parseTimeRangePreset(
  preset: TimeRangePreset,
  referenceDate: Date = new Date()
): TimeRange {
  const now = new Date(referenceDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case 'today': {
      const end = new Date(today);
      end.setHours(23, 59, 59, 999);
      return {
        start: today,
        end,
        description: 'today',
      };
    }

    case 'this_week': {
      // Start from Monday of current week
      const dayOfWeek = today.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const start = new Date(today);
      start.setDate(today.getDate() - daysToMonday);

      const end = new Date(now);
      end.setHours(23, 59, 59, 999);

      return {
        start,
        end,
        description: 'this week',
      };
    }

    case 'last_7_days': {
      const start = new Date(today);
      start.setDate(today.getDate() - 6); // Include today, so -6 for 7 days total

      const end = new Date(now);
      end.setHours(23, 59, 59, 999);

      return {
        start,
        end,
        description: 'last 7 days',
      };
    }

    case 'last_30_days': {
      const start = new Date(today);
      start.setDate(today.getDate() - 29); // Include today, so -29 for 30 days total

      const end = new Date(now);
      end.setHours(23, 59, 59, 999);

      return {
        start,
        end,
        description: 'last 30 days',
      };
    }

    case 'this_month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);

      const end = new Date(now);
      end.setHours(23, 59, 59, 999);

      return {
        start,
        end,
        description: 'this month',
      };
    }

    case 'last_month': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);

      return {
        start,
        end,
        description: 'last month',
      };
    }

    default: {
      // Default to last 7 days
      const start = new Date(today);
      start.setDate(today.getDate() - 6);

      const end = new Date(now);
      end.setHours(23, 59, 59, 999);

      return {
        start,
        end,
        description: 'last 7 days',
      };
    }
  }
}

/**
 * Parse a natural language query to extract time range
 */
export function parseTimeQuery(query: string, referenceDate: Date = new Date()): ParsedTimeQuery {
  const normalizedQuery = query.trim().toLowerCase();

  // Today patterns
  const todayPatterns = [
    /what did i (?:ship|complete|finish|close|do) today/i,
    /today'?s? (?:completions?|shipped|done|completed)/i,
    /show (?:me )?(?:what was )?(?:shipped|completed|done|closed) today/i,
    /completions? (?:from )?today/i,
  ];

  for (const pattern of todayPatterns) {
    if (pattern.test(query)) {
      return {
        preset: 'today',
        timeRange: parseTimeRangePreset('today', referenceDate),
        confidence: 0.95,
        originalQuery: query,
      };
    }
  }

  // This week patterns
  const thisWeekPatterns = [
    /what did i (?:ship|complete|finish|close|do) this week/i,
    /this week'?s? (?:completions?|shipped|done|completed)/i,
    /show (?:me )?(?:what was )?(?:shipped|completed|done|closed) this week/i,
    /completions? (?:from )?this week/i,
    /what have i (?:shipped|completed|done) this week/i,
  ];

  for (const pattern of thisWeekPatterns) {
    if (pattern.test(query)) {
      return {
        preset: 'this_week',
        timeRange: parseTimeRangePreset('this_week', referenceDate),
        confidence: 0.95,
        originalQuery: query,
      };
    }
  }

  // Last 7 days patterns
  const last7DaysPatterns = [
    /(?:last|past) (?:7|seven) days?/i,
    /last week/i, // Common interpretation of "last week" is past 7 days
    /recent (?:completions?|shipped|done)/i,
    /recently (?:completed|shipped|done|closed)/i,
  ];

  for (const pattern of last7DaysPatterns) {
    if (pattern.test(query)) {
      return {
        preset: 'last_7_days',
        timeRange: parseTimeRangePreset('last_7_days', referenceDate),
        confidence: 0.9,
        originalQuery: query,
      };
    }
  }

  // This month patterns
  const thisMonthPatterns = [
    /what did i (?:ship|complete|finish|close|do) this month/i,
    /this month'?s? (?:completions?|shipped|done|completed)/i,
    /show (?:me )?(?:what was )?(?:shipped|completed|done|closed) this month/i,
    /completions? (?:from )?this month/i,
  ];

  for (const pattern of thisMonthPatterns) {
    if (pattern.test(query)) {
      return {
        preset: 'this_month',
        timeRange: parseTimeRangePreset('this_month', referenceDate),
        confidence: 0.95,
        originalQuery: query,
      };
    }
  }

  // Last month patterns
  const lastMonthPatterns = [
    /what did i (?:ship|complete|finish|close|do) last month/i,
    /last month'?s? (?:completions?|shipped|done|completed)/i,
    /show (?:me )?(?:what was )?(?:shipped|completed|done|closed) last month/i,
    /completions? (?:from )?last month/i,
  ];

  for (const pattern of lastMonthPatterns) {
    if (pattern.test(query)) {
      return {
        preset: 'last_month',
        timeRange: parseTimeRangePreset('last_month', referenceDate),
        confidence: 0.95,
        originalQuery: query,
      };
    }
  }

  // Last 30 days patterns
  const last30DaysPatterns = [
    /(?:last|past) (?:30|thirty) days?/i,
    /(?:last|past) month(?!'s)/i, // "past month" but not "past month's"
  ];

  for (const pattern of last30DaysPatterns) {
    if (pattern.test(query)) {
      return {
        preset: 'last_30_days',
        timeRange: parseTimeRangePreset('last_30_days', referenceDate),
        confidence: 0.9,
        originalQuery: query,
      };
    }
  }

  // Generic "shipped" or "completed" query - default to this week
  const genericPatterns = [
    /what did i (?:ship|complete|finish|close|do)\??$/i,
    /what have i (?:shipped|completed|done)\??$/i,
    /show (?:me )?(?:my )?(?:completions?|shipped)/i,
  ];

  for (const pattern of genericPatterns) {
    if (pattern.test(query)) {
      return {
        preset: 'this_week',
        timeRange: parseTimeRangePreset('this_week', referenceDate),
        confidence: 0.7,
        originalQuery: query,
      };
    }
  }

  // No match
  return {
    preset: null,
    timeRange: null,
    confidence: 0,
    originalQuery: query,
  };
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
 * Check if an item was closed within a time range
 */
function isClosedInRange(item: ProjectItem, timeRange: TimeRange, doneStatusName: string): boolean {
  const status = getItemStatus(item);
  if (status?.toLowerCase() !== doneStatusName.toLowerCase()) {
    return false;
  }

  const content = item.content as IssueContent | PullRequestContent | null;
  if (!content?.closedAt) {
    return false;
  }

  const closedDate = new Date(content.closedAt);
  return closedDate >= timeRange.start && closedDate <= timeRange.end;
}

/**
 * Convert a project item to a shipped item
 */
function toShippedItem(item: ProjectItem, projectName: string): ShippedItem | null {
  const content = item.content as IssueContent | PullRequestContent | null;
  if (!content?.closedAt) {
    return null;
  }

  const closedAt = new Date(content.closedAt);

  return {
    number: content.number,
    title: content.title,
    url: content.url,
    projectName,
    closedAt,
    closedDay: DAY_NAMES[closedAt.getDay()],
  };
}

/**
 * Fetch project items with error handling
 */
async function fetchProjectItems(
  client: GitHubClient,
  projectConfig: NormalizedProjectConfig
): Promise<{ items: ProjectItem[]; error?: string }> {
  try {
    const projectContext = await client.getProject(
      projectConfig.org,
      projectConfig.projectNumber,
      true
    );
    const items = await client.getProjectItems(projectContext.projectId);
    return { items };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { items: [], error: errorMessage };
  }
}

/**
 * Query for shipped/completed items within a time range
 */
export async function queryShippedItems(
  client: GitHubClient,
  config: NormalizedConfig,
  timeRange: TimeRange,
  options: TimeBasedQueryOptions = {}
): Promise<ShippedItemsResponse> {
  const fetchedAt = new Date();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const continueOnError = options.continueOnError ?? true;

  const doneStatus = config.statusFieldMapping.done;

  // Filter projects if specific names are requested
  let projectsToQuery = config.projects;
  if (options.projectNames && options.projectNames.length > 0) {
    const lowerNames = options.projectNames.map((n) => n.toLowerCase());
    projectsToQuery = config.projects.filter((p) =>
      lowerNames.includes(p.name.toLowerCase())
    );
  }

  // Create a timeout promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Query timed out')), timeoutMs);
  });

  try {
    // Fetch items from all projects in parallel
    const fetchPromises = projectsToQuery.map(
      async (projectConfig): Promise<ProjectShippedSummary> => {
        const { items, error } = await fetchProjectItems(client, projectConfig);

        if (error) {
          return {
            projectName: projectConfig.name,
            items: [],
            count: 0,
            success: false,
            error,
          };
        }

        const shippedItems: ShippedItem[] = [];
        for (const item of items) {
          if (isClosedInRange(item, timeRange, doneStatus)) {
            const shipped = toShippedItem(item, projectConfig.name);
            if (shipped) {
              shippedItems.push(shipped);
            }
          }
        }

        // Sort by closedAt descending (most recent first)
        shippedItems.sort((a, b) => b.closedAt.getTime() - a.closedAt.getTime());

        return {
          projectName: projectConfig.name,
          items: shippedItems,
          count: shippedItems.length,
          success: true,
        };
      }
    );

    const projectSummaries = await Promise.race([
      Promise.all(fetchPromises),
      timeoutPromise,
    ]);

    // Check if all projects failed
    const allFailed = projectSummaries.every((s) => !s.success);
    if (allFailed && !continueOnError) {
      return {
        success: false,
        error: 'All projects failed to fetch',
        projectSummaries,
        totalShipped: 0,
        timeRange,
        fetchedAt,
      };
    }

    // Calculate total shipped
    const totalShipped = projectSummaries.reduce((sum, s) => sum + s.count, 0);

    return {
      success: true,
      projectSummaries,
      totalShipped,
      timeRange,
      fetchedAt,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage,
      projectSummaries: [],
      totalShipped: 0,
      timeRange,
      fetchedAt,
    };
  }
}

/**
 * Format shipped items response as a human-readable string
 */
export function formatShippedItemsResponse(response: ShippedItemsResponse): string {
  if (!response.success) {
    return `Unable to fetch shipped items: ${response.error}`;
  }

  if (response.totalShipped === 0) {
    return `What you shipped ${response.timeRange.description}:\nNo items shipped.`;
  }

  const lines: string[] = [`What you shipped ${response.timeRange.description}:`];

  for (const summary of response.projectSummaries) {
    if (!summary.success) {
      lines.push(`${summary.projectName}: (failed to fetch: ${summary.error})`);
      continue;
    }

    if (summary.count === 0) {
      continue;
    }

    lines.push(`${summary.projectName}:`);
    for (const item of summary.items) {
      lines.push(`- ${item.title} (#${item.number}) - closed ${item.closedDay}`);
    }
  }

  lines.push(`Total: ${response.totalShipped} item${response.totalShipped === 1 ? '' : 's'} shipped`);

  return lines.join('\n');
}

/**
 * Handle a natural language time-based query
 */
export async function handleTimeBasedQuery(
  query: string,
  client: GitHubClient,
  config: NormalizedConfig,
  options: TimeBasedQueryOptions = {}
): Promise<ShippedItemsResponse> {
  const referenceDate = options.referenceDate ?? new Date();
  const parsed = parseTimeQuery(query, referenceDate);

  if (!parsed.timeRange || parsed.confidence < 0.5) {
    // Default to "this week" if we can't parse the query
    const timeRange = parseTimeRangePreset('this_week', referenceDate);
    return queryShippedItems(client, config, timeRange, options);
  }

  return queryShippedItems(client, config, parsed.timeRange, options);
}
