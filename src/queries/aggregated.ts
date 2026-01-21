/**
 * Cross-project aggregated queries for GitHub Projects
 * Handles queries like "what's blocking?", "standup summary", and "open issues count"
 */

import type { GitHubClient } from '../github/client.js';
import type { NormalizedConfig, NormalizedProjectConfig } from '../types/config.js';
import type { ProjectItem, IssueContent, ProjectItemFieldSingleSelectValue } from '../github/types.js';
import type {
  BlockedItem,
  BlockedItemsResponse,
  ProjectStandupSummary,
  StandupSummaryResponse,
  OpenCountResponse,
  AggregatedQueryOptions,
} from './types.js';

const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds
const DAYS_FOR_DONE_THIS_WEEK = 7;

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
 * Check if an item is blocked based on status or labels
 */
function isItemBlocked(item: ProjectItem, blockedStatusName: string): boolean {
  const status = getItemStatus(item);
  if (status?.toLowerCase() === blockedStatusName.toLowerCase()) {
    return true;
  }

  // Also check for blocked labels
  const content = item.content as IssueContent | null;
  if (content?.labels?.nodes?.some((l) => l.name.toLowerCase().startsWith('blocked'))) {
    return true;
  }

  return false;
}

/**
 * Check if an item is in progress based on status
 */
function isItemInProgress(item: ProjectItem, inProgressStatusName: string): boolean {
  const status = getItemStatus(item);
  return status?.toLowerCase() === inProgressStatusName.toLowerCase();
}

/**
 * Check if an item was completed within the last N days
 */
function isCompletedWithinDays(item: ProjectItem, days: number, doneStatusName: string): boolean {
  const status = getItemStatus(item);
  if (status?.toLowerCase() !== doneStatusName.toLowerCase()) {
    return false;
  }

  const content = item.content as IssueContent | null;
  if (!content?.closedAt) {
    // If no closedAt but status is Done, consider it done this week
    // (some workflows don't close issues immediately)
    return true;
  }

  const closedDate = new Date(content.closedAt);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  return closedDate >= cutoffDate;
}

/**
 * Check if an item is open (not in Done status)
 */
function isItemOpen(item: ProjectItem, doneStatusName: string): boolean {
  const status = getItemStatus(item);
  if (!status) {
    return true; // No status = open
  }
  return status.toLowerCase() !== doneStatusName.toLowerCase();
}

/**
 * Extract block reason from item labels
 */
function extractBlockReason(item: ProjectItem): string | undefined {
  const content = item.content as IssueContent | null;
  if (!content?.labels?.nodes) {
    return undefined;
  }

  const blockedLabel = content.labels.nodes.find((l) =>
    l.name.toLowerCase().startsWith('blocked')
  );

  if (blockedLabel) {
    const reason = blockedLabel.name.replace(/^blocked:?\s*/i, '').trim();
    return reason || undefined;
  }

  return undefined;
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
 * Query for all blocked items across all configured projects
 */
export async function queryBlockedItems(
  client: GitHubClient,
  config: NormalizedConfig,
  options: AggregatedQueryOptions = {}
): Promise<BlockedItemsResponse> {
  const fetchedAt = new Date();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const continueOnError = options.continueOnError ?? true;

  const blockedStatusName = config.statusFieldMapping.blocked;

  // Create a timeout promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Query timed out')), timeoutMs);
  });

  try {
    // Fetch items from all projects in parallel
    const fetchPromises = config.projects.map(async (projectConfig) => {
      const { items, error } = await fetchProjectItems(client, projectConfig);

      if (error && !continueOnError) {
        throw new Error(`Failed to fetch ${projectConfig.name}: ${error}`);
      }

      const blockedItems: BlockedItem[] = [];
      for (const item of items) {
        if (isItemBlocked(item, blockedStatusName) && item.content) {
          blockedItems.push({
            number: item.content.number,
            title: item.content.title,
            url: item.content.url,
            projectName: projectConfig.name,
            reason: extractBlockReason(item),
          });
        }
      }

      return blockedItems;
    });

    const results = await Promise.race([
      Promise.all(fetchPromises),
      timeoutPromise,
    ]);

    const allBlockedItems = results.flat();

    return {
      success: true,
      blockedItems: allBlockedItems,
      totalBlocked: allBlockedItems.length,
      fetchedAt,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage,
      blockedItems: [],
      totalBlocked: 0,
      fetchedAt,
    };
  }
}

/**
 * Format blocked items response as a human-readable string
 */
export function formatBlockedItemsResponse(response: BlockedItemsResponse): string {
  if (!response.success) {
    return `Unable to fetch blocked items: ${response.error}`;
  }

  if (response.blockedItems.length === 0) {
    return 'Blocked Items:\nNo blocked items across any projects.';
  }

  const lines: string[] = ['Blocked Items:'];

  for (const item of response.blockedItems) {
    const reason = item.reason ? ` - ${item.reason}` : '';
    lines.push(`- ${item.title} (#${item.number}) - ${item.projectName}${reason}`);
  }

  return lines.join('\n');
}

/**
 * Query for standup summary across all configured projects
 */
export async function queryStandupSummary(
  client: GitHubClient,
  config: NormalizedConfig,
  options: AggregatedQueryOptions = {}
): Promise<StandupSummaryResponse> {
  const fetchedAt = new Date();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const continueOnError = options.continueOnError ?? true;

  const { in_progress: inProgressStatus, blocked: blockedStatus, done: doneStatus } =
    config.statusFieldMapping;

  // Create a timeout promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Query timed out')), timeoutMs);
  });

  try {
    // Fetch items from all projects in parallel
    const fetchPromises = config.projects.map(
      async (projectConfig): Promise<ProjectStandupSummary> => {
        const { items, error } = await fetchProjectItems(client, projectConfig);

        if (error) {
          return {
            projectName: projectConfig.name,
            inProgressCount: 0,
            blockedCount: 0,
            doneThisWeekCount: 0,
            success: false,
            error,
          };
        }

        let inProgressCount = 0;
        let blockedCount = 0;
        let doneThisWeekCount = 0;

        for (const item of items) {
          if (isItemInProgress(item, inProgressStatus)) {
            inProgressCount++;
          }
          if (isItemBlocked(item, blockedStatus)) {
            blockedCount++;
          }
          if (isCompletedWithinDays(item, DAYS_FOR_DONE_THIS_WEEK, doneStatus)) {
            doneThisWeekCount++;
          }
        }

        return {
          projectName: projectConfig.name,
          inProgressCount,
          blockedCount,
          doneThisWeekCount,
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
        totalInProgress: 0,
        totalBlocked: 0,
        totalDoneThisWeek: 0,
        fetchedAt,
      };
    }

    // Calculate totals
    const totalInProgress = projectSummaries.reduce((sum, s) => sum + s.inProgressCount, 0);
    const totalBlocked = projectSummaries.reduce((sum, s) => sum + s.blockedCount, 0);
    const totalDoneThisWeek = projectSummaries.reduce((sum, s) => sum + s.doneThisWeekCount, 0);

    return {
      success: true,
      projectSummaries,
      totalInProgress,
      totalBlocked,
      totalDoneThisWeek,
      fetchedAt,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage,
      projectSummaries: [],
      totalInProgress: 0,
      totalBlocked: 0,
      totalDoneThisWeek: 0,
      fetchedAt,
    };
  }
}

/**
 * Format standup summary response as a human-readable string
 */
export function formatStandupSummaryResponse(response: StandupSummaryResponse): string {
  if (!response.success) {
    return `Unable to fetch standup summary: ${response.error}`;
  }

  const lines: string[] = ['Daily Standup Summary:'];

  for (const summary of response.projectSummaries) {
    if (summary.success) {
      lines.push(
        `${summary.projectName}: ${summary.inProgressCount} in progress, ` +
          `${summary.blockedCount} blocked, ${summary.doneThisWeekCount} done this week`
      );
    } else {
      lines.push(`${summary.projectName}: (failed to fetch: ${summary.error})`);
    }
  }

  lines.push(
    `Total: ${response.totalInProgress} in progress, ` +
      `${response.totalBlocked} blocked, ${response.totalDoneThisWeek} done this week`
  );

  return lines.join('\n');
}

/**
 * Query for total open issues count across all configured projects
 */
export async function queryOpenCount(
  client: GitHubClient,
  config: NormalizedConfig,
  options: AggregatedQueryOptions = {}
): Promise<OpenCountResponse> {
  const fetchedAt = new Date();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const continueOnError = options.continueOnError ?? true;

  const doneStatus = config.statusFieldMapping.done;

  // Create a timeout promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Query timed out')), timeoutMs);
  });

  try {
    // Fetch items from all projects in parallel
    const fetchPromises = config.projects.map(async (projectConfig) => {
      const { items, error } = await fetchProjectItems(client, projectConfig);

      if (error) {
        return {
          projectName: projectConfig.name,
          openCount: 0,
          success: false,
          error,
        };
      }

      const openCount = items.filter((item) => isItemOpen(item, doneStatus)).length;

      return {
        projectName: projectConfig.name,
        openCount,
        success: true,
      };
    });

    const projectCounts = await Promise.race([
      Promise.all(fetchPromises),
      timeoutPromise,
    ]);

    // Check if all projects failed
    const allFailed = projectCounts.every((c) => !c.success);
    if (allFailed && !continueOnError) {
      return {
        success: false,
        error: 'All projects failed to fetch',
        totalOpen: 0,
        projectCounts,
        fetchedAt,
      };
    }

    const totalOpen = projectCounts.reduce((sum, c) => sum + c.openCount, 0);

    return {
      success: true,
      totalOpen,
      projectCounts,
      fetchedAt,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage,
      totalOpen: 0,
      projectCounts: [],
      fetchedAt,
    };
  }
}

/**
 * Format open count response as a human-readable string
 */
export function formatOpenCountResponse(response: OpenCountResponse): string {
  if (!response.success) {
    return `Unable to fetch open count: ${response.error}`;
  }

  const lines: string[] = ['Open Items:'];

  for (const count of response.projectCounts) {
    if (count.success) {
      lines.push(`${count.projectName}: ${count.openCount} open`);
    } else {
      lines.push(`${count.projectName}: (failed to fetch: ${count.error})`);
    }
  }

  lines.push(`Total: ${response.totalOpen} open items`);

  return lines.join('\n');
}
