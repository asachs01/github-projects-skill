import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  queryBlockedItems,
  formatBlockedItemsResponse,
  queryStandupSummary,
  formatStandupSummaryResponse,
  queryOpenCount,
  formatOpenCountResponse,
} from '../queries/aggregated.js';
import type {
  BlockedItemsResponse,
  StandupSummaryResponse,
  OpenCountResponse,
} from '../queries/types.js';
import type { NormalizedConfig } from '../types/config.js';
import type { ProjectItem, IssueContent } from '../github/types.js';
import type { GitHubClient } from '../github/client.js';

// Mock configuration with multiple projects
const mockConfig: NormalizedConfig = {
  github: { token: 'test-token' },
  projects: [
    { name: 'DocuGen', org: 'testorg', projectNumber: 1, repos: ['testorg/docugen'] },
    { name: 'CoreLib', org: 'testorg', projectNumber: 2, repos: ['testorg/corelib'] },
    { name: 'API Platform', org: 'testorg', projectNumber: 3, repos: ['testorg/api'] },
  ],
  statusFieldMapping: {
    backlog: 'Backlog',
    ready: 'Ready',
    in_progress: 'In Progress',
    blocked: 'Blocked',
    done: 'Done',
  },
  labels: {
    blocked_prefix: 'blocked:',
    priority_prefix: 'priority:',
    type_prefix: 'type:',
  },
};

// Helper to create mock project items
function createMockItem(
  number: number,
  title: string,
  status: string,
  options: {
    closedAt?: string;
    labels?: string[];
    state?: 'OPEN' | 'CLOSED';
  } = {}
): ProjectItem {
  const now = new Date();
  const content: IssueContent = {
    id: `issue-${number}`,
    number,
    title,
    url: `https://github.com/testorg/repo/issues/${number}`,
    state: options.state ?? 'OPEN',
    labels: { nodes: (options.labels ?? []).map((name) => ({ name })) },
    assignees: { nodes: [] },
    updatedAt: now.toISOString(),
    closedAt: options.closedAt ?? null,
  };

  return {
    id: `item-${number}`,
    fieldValues: {
      nodes: [
        {
          field: { name: 'Status' },
          name: status,
          optionId: `option-${status.toLowerCase().replace(/\s+/g, '-')}`,
        },
      ],
    },
    content,
  };
}

// Helper to create project context
function createMockProjectContext(projectNumber: number) {
  return {
    projectId: `proj-${projectNumber}`,
    projectNumber,
    statusFieldId: 'field-status',
    statusOptions: new Map([
      ['in progress', 'opt-1'],
      ['blocked', 'opt-2'],
      ['done', 'opt-3'],
      ['backlog', 'opt-4'],
    ]),
    cachedAt: Date.now(),
  };
}

describe('queryBlockedItems', () => {
  let mockClient: GitHubClient;

  beforeEach(() => {
    mockClient = {
      getProject: vi.fn(),
      getProjectItems: vi.fn(),
    } as unknown as GitHubClient;
  });

  it('returns blocked items from all projects', async () => {
    // Setup mock for each project
    vi.mocked(mockClient.getProject).mockImplementation((org, projectNumber) => {
      return Promise.resolve(createMockProjectContext(projectNumber));
    });

    vi.mocked(mockClient.getProjectItems).mockImplementation((projectId) => {
      if (projectId === 'proj-1') {
        // DocuGen - 1 blocked item
        return Promise.resolve([
          createMockItem(7, 'Export module', 'Blocked', { labels: ['blocked:design review'] }),
          createMockItem(12, 'PDF extraction', 'In Progress'),
        ]);
      } else if (projectId === 'proj-2') {
        // CoreLib - 1 blocked item
        return Promise.resolve([
          createMockItem(15, 'Auth integration', 'Blocked', { labels: ['blocked:API changes'] }),
          createMockItem(20, 'Cache layer', 'Done'),
        ]);
      } else {
        // API Platform - no blocked items
        return Promise.resolve([
          createMockItem(5, 'Rate limiting', 'In Progress'),
        ]);
      }
    });

    const result = await queryBlockedItems(mockClient, mockConfig);

    expect(result.success).toBe(true);
    expect(result.totalBlocked).toBe(2);
    expect(result.blockedItems).toHaveLength(2);

    // Check first blocked item
    const docuGenBlocked = result.blockedItems.find((i) => i.projectName === 'DocuGen');
    expect(docuGenBlocked).toBeDefined();
    expect(docuGenBlocked?.title).toBe('Export module');
    expect(docuGenBlocked?.number).toBe(7);
    expect(docuGenBlocked?.reason).toBe('design review');

    // Check second blocked item
    const coreLibBlocked = result.blockedItems.find((i) => i.projectName === 'CoreLib');
    expect(coreLibBlocked).toBeDefined();
    expect(coreLibBlocked?.title).toBe('Auth integration');
    expect(coreLibBlocked?.reason).toBe('API changes');
  });

  it('returns empty list when no blocked items', async () => {
    vi.mocked(mockClient.getProject).mockImplementation((org, projectNumber) => {
      return Promise.resolve(createMockProjectContext(projectNumber));
    });

    vi.mocked(mockClient.getProjectItems).mockResolvedValue([
      createMockItem(1, 'Task 1', 'In Progress'),
      createMockItem(2, 'Task 2', 'Done'),
    ]);

    const result = await queryBlockedItems(mockClient, mockConfig);

    expect(result.success).toBe(true);
    expect(result.totalBlocked).toBe(0);
    expect(result.blockedItems).toHaveLength(0);
  });

  it('continues on error when continueOnError is true', async () => {
    vi.mocked(mockClient.getProject).mockImplementation((org, projectNumber) => {
      if (projectNumber === 2) {
        return Promise.reject(new Error('API error'));
      }
      return Promise.resolve(createMockProjectContext(projectNumber));
    });

    vi.mocked(mockClient.getProjectItems).mockResolvedValue([
      createMockItem(7, 'Blocked task', 'Blocked'),
    ]);

    const result = await queryBlockedItems(mockClient, mockConfig, { continueOnError: true });

    expect(result.success).toBe(true);
    // Should still have blocked items from other projects
    expect(result.totalBlocked).toBe(2); // From DocuGen and API Platform
  });

  it('detects blocked items by label even if status is not Blocked', async () => {
    vi.mocked(mockClient.getProject).mockImplementation((org, projectNumber) => {
      return Promise.resolve(createMockProjectContext(projectNumber));
    });

    vi.mocked(mockClient.getProjectItems).mockResolvedValue([
      createMockItem(10, 'Waiting on external', 'In Progress', { labels: ['blocked:external team'] }),
    ]);

    const result = await queryBlockedItems(mockClient, mockConfig);

    expect(result.success).toBe(true);
    expect(result.totalBlocked).toBe(3); // One per project
    expect(result.blockedItems[0].reason).toBe('external team');
  });
});

describe('formatBlockedItemsResponse', () => {
  it('formats blocked items correctly', () => {
    const response: BlockedItemsResponse = {
      success: true,
      blockedItems: [
        {
          number: 7,
          title: 'Export module',
          url: 'https://example.com/7',
          projectName: 'DocuGen',
          reason: 'waiting on design review',
        },
        {
          number: 15,
          title: 'Auth integration',
          url: 'https://example.com/15',
          projectName: 'CoreLib',
          reason: 'depends on API changes',
        },
      ],
      totalBlocked: 2,
      fetchedAt: new Date(),
    };

    const formatted = formatBlockedItemsResponse(response);

    expect(formatted).toContain('Blocked Items:');
    expect(formatted).toContain('Export module (#7) - DocuGen - waiting on design review');
    expect(formatted).toContain('Auth integration (#15) - CoreLib - depends on API changes');
  });

  it('formats empty blocked items correctly', () => {
    const response: BlockedItemsResponse = {
      success: true,
      blockedItems: [],
      totalBlocked: 0,
      fetchedAt: new Date(),
    };

    const formatted = formatBlockedItemsResponse(response);

    expect(formatted).toContain('Blocked Items:');
    expect(formatted).toContain('No blocked items across any projects');
  });

  it('formats error response correctly', () => {
    const response: BlockedItemsResponse = {
      success: false,
      error: 'API rate limited',
      blockedItems: [],
      totalBlocked: 0,
      fetchedAt: new Date(),
    };

    const formatted = formatBlockedItemsResponse(response);

    expect(formatted).toContain('Unable to fetch blocked items');
    expect(formatted).toContain('API rate limited');
  });
});

describe('queryStandupSummary', () => {
  let mockClient: GitHubClient;

  beforeEach(() => {
    mockClient = {
      getProject: vi.fn(),
      getProjectItems: vi.fn(),
    } as unknown as GitHubClient;
  });

  it('returns standup summary for all projects', async () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 2); // 2 days ago

    vi.mocked(mockClient.getProject).mockImplementation((org, projectNumber) => {
      return Promise.resolve(createMockProjectContext(projectNumber));
    });

    vi.mocked(mockClient.getProjectItems).mockImplementation((projectId) => {
      if (projectId === 'proj-1') {
        // DocuGen: 3 in progress, 1 blocked, 2 done this week
        return Promise.resolve([
          createMockItem(1, 'Task 1', 'In Progress'),
          createMockItem(2, 'Task 2', 'In Progress'),
          createMockItem(3, 'Task 3', 'In Progress'),
          createMockItem(4, 'Task 4', 'Blocked'),
          createMockItem(5, 'Task 5', 'Done', { closedAt: recentDate.toISOString(), state: 'CLOSED' }),
          createMockItem(6, 'Task 6', 'Done', { closedAt: recentDate.toISOString(), state: 'CLOSED' }),
        ]);
      } else if (projectId === 'proj-2') {
        // CoreLib: 2 in progress, 0 blocked, 3 done this week
        return Promise.resolve([
          createMockItem(10, 'Task 10', 'In Progress'),
          createMockItem(11, 'Task 11', 'In Progress'),
          createMockItem(12, 'Task 12', 'Done', { closedAt: recentDate.toISOString(), state: 'CLOSED' }),
          createMockItem(13, 'Task 13', 'Done', { closedAt: recentDate.toISOString(), state: 'CLOSED' }),
          createMockItem(14, 'Task 14', 'Done', { closedAt: recentDate.toISOString(), state: 'CLOSED' }),
        ]);
      } else {
        // API Platform: 1 in progress, 0 blocked, 1 done
        return Promise.resolve([
          createMockItem(20, 'Task 20', 'In Progress'),
          createMockItem(21, 'Task 21', 'Done', { closedAt: recentDate.toISOString(), state: 'CLOSED' }),
        ]);
      }
    });

    const result = await queryStandupSummary(mockClient, mockConfig);

    expect(result.success).toBe(true);
    expect(result.projectSummaries).toHaveLength(3);

    // Check DocuGen summary
    const docuGen = result.projectSummaries.find((s) => s.projectName === 'DocuGen');
    expect(docuGen?.inProgressCount).toBe(3);
    expect(docuGen?.blockedCount).toBe(1);
    expect(docuGen?.doneThisWeekCount).toBe(2);

    // Check CoreLib summary
    const coreLib = result.projectSummaries.find((s) => s.projectName === 'CoreLib');
    expect(coreLib?.inProgressCount).toBe(2);
    expect(coreLib?.blockedCount).toBe(0);
    expect(coreLib?.doneThisWeekCount).toBe(3);

    // Check totals
    expect(result.totalInProgress).toBe(6); // 3 + 2 + 1
    expect(result.totalBlocked).toBe(1);
    expect(result.totalDoneThisWeek).toBe(6); // 2 + 3 + 1
  });

  it('handles failed projects gracefully', async () => {
    vi.mocked(mockClient.getProject).mockImplementation((org, projectNumber) => {
      if (projectNumber === 2) {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve(createMockProjectContext(projectNumber));
    });

    vi.mocked(mockClient.getProjectItems).mockResolvedValue([
      createMockItem(1, 'Task 1', 'In Progress'),
    ]);

    const result = await queryStandupSummary(mockClient, mockConfig);

    expect(result.success).toBe(true);

    // CoreLib should show as failed
    const coreLib = result.projectSummaries.find((s) => s.projectName === 'CoreLib');
    expect(coreLib?.success).toBe(false);
    expect(coreLib?.error).toContain('Network error');

    // Totals should only include successful projects
    expect(result.totalInProgress).toBe(2); // From DocuGen and API Platform
  });
});

describe('formatStandupSummaryResponse', () => {
  it('formats standup summary correctly', () => {
    const response: StandupSummaryResponse = {
      success: true,
      projectSummaries: [
        {
          projectName: 'DocuGen',
          inProgressCount: 3,
          blockedCount: 1,
          doneThisWeekCount: 5,
          success: true,
        },
        {
          projectName: 'CoreLib',
          inProgressCount: 2,
          blockedCount: 0,
          doneThisWeekCount: 3,
          success: true,
        },
      ],
      totalInProgress: 5,
      totalBlocked: 1,
      totalDoneThisWeek: 8,
      fetchedAt: new Date(),
    };

    const formatted = formatStandupSummaryResponse(response);

    expect(formatted).toContain('Daily Standup Summary:');
    expect(formatted).toContain('DocuGen: 3 in progress, 1 blocked, 5 done this week');
    expect(formatted).toContain('CoreLib: 2 in progress, 0 blocked, 3 done this week');
    expect(formatted).toContain('Total: 5 in progress, 1 blocked, 8 done this week');
  });

  it('shows failed projects', () => {
    const response: StandupSummaryResponse = {
      success: true,
      projectSummaries: [
        {
          projectName: 'DocuGen',
          inProgressCount: 3,
          blockedCount: 1,
          doneThisWeekCount: 5,
          success: true,
        },
        {
          projectName: 'CoreLib',
          inProgressCount: 0,
          blockedCount: 0,
          doneThisWeekCount: 0,
          success: false,
          error: 'API timeout',
        },
      ],
      totalInProgress: 3,
      totalBlocked: 1,
      totalDoneThisWeek: 5,
      fetchedAt: new Date(),
    };

    const formatted = formatStandupSummaryResponse(response);

    expect(formatted).toContain('CoreLib: (failed to fetch: API timeout)');
  });
});

describe('queryOpenCount', () => {
  let mockClient: GitHubClient;

  beforeEach(() => {
    mockClient = {
      getProject: vi.fn(),
      getProjectItems: vi.fn(),
    } as unknown as GitHubClient;
  });

  it('returns open count for all projects', async () => {
    vi.mocked(mockClient.getProject).mockImplementation((org, projectNumber) => {
      return Promise.resolve(createMockProjectContext(projectNumber));
    });

    vi.mocked(mockClient.getProjectItems).mockImplementation((projectId) => {
      if (projectId === 'proj-1') {
        // DocuGen: 5 open, 2 done
        return Promise.resolve([
          createMockItem(1, 'Task 1', 'In Progress'),
          createMockItem(2, 'Task 2', 'In Progress'),
          createMockItem(3, 'Task 3', 'Blocked'),
          createMockItem(4, 'Task 4', 'Backlog'),
          createMockItem(5, 'Task 5', 'Ready'),
          createMockItem(6, 'Task 6', 'Done'),
          createMockItem(7, 'Task 7', 'Done'),
        ]);
      } else if (projectId === 'proj-2') {
        // CoreLib: 3 open
        return Promise.resolve([
          createMockItem(10, 'Task 10', 'In Progress'),
          createMockItem(11, 'Task 11', 'Backlog'),
          createMockItem(12, 'Task 12', 'Ready'),
        ]);
      } else {
        // API Platform: 2 open
        return Promise.resolve([
          createMockItem(20, 'Task 20', 'In Progress'),
          createMockItem(21, 'Task 21', 'Blocked'),
        ]);
      }
    });

    const result = await queryOpenCount(mockClient, mockConfig);

    expect(result.success).toBe(true);
    expect(result.totalOpen).toBe(10); // 5 + 3 + 2

    // Check per-project counts
    const docuGen = result.projectCounts.find((c) => c.projectName === 'DocuGen');
    expect(docuGen?.openCount).toBe(5);

    const coreLib = result.projectCounts.find((c) => c.projectName === 'CoreLib');
    expect(coreLib?.openCount).toBe(3);

    const apiPlatform = result.projectCounts.find((c) => c.projectName === 'API Platform');
    expect(apiPlatform?.openCount).toBe(2);
  });

  it('handles timeout correctly', async () => {
    vi.mocked(mockClient.getProject).mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(() => resolve(createMockProjectContext(1)), 500);
      });
    });

    const result = await queryOpenCount(mockClient, mockConfig, { timeoutMs: 100 });

    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
  });
});

describe('formatOpenCountResponse', () => {
  it('formats open count correctly', () => {
    const response: OpenCountResponse = {
      success: true,
      totalOpen: 15,
      projectCounts: [
        { projectName: 'DocuGen', openCount: 7, success: true },
        { projectName: 'CoreLib', openCount: 5, success: true },
        { projectName: 'API Platform', openCount: 3, success: true },
      ],
      fetchedAt: new Date(),
    };

    const formatted = formatOpenCountResponse(response);

    expect(formatted).toContain('Open Items:');
    expect(formatted).toContain('DocuGen: 7 open');
    expect(formatted).toContain('CoreLib: 5 open');
    expect(formatted).toContain('API Platform: 3 open');
    expect(formatted).toContain('Total: 15 open items');
  });

  it('shows failed projects', () => {
    const response: OpenCountResponse = {
      success: true,
      totalOpen: 7,
      projectCounts: [
        { projectName: 'DocuGen', openCount: 7, success: true },
        { projectName: 'CoreLib', openCount: 0, success: false, error: 'Permission denied' },
      ],
      fetchedAt: new Date(),
    };

    const formatted = formatOpenCountResponse(response);

    expect(formatted).toContain('CoreLib: (failed to fetch: Permission denied)');
  });
});

describe('Performance', () => {
  let mockClient: GitHubClient;

  beforeEach(() => {
    mockClient = {
      getProject: vi.fn(),
      getProjectItems: vi.fn(),
    } as unknown as GitHubClient;
  });

  it('fetches all projects in parallel', async () => {
    const callOrder: number[] = [];

    vi.mocked(mockClient.getProject).mockImplementation((org, projectNumber) => {
      callOrder.push(projectNumber);
      return Promise.resolve(createMockProjectContext(projectNumber));
    });

    vi.mocked(mockClient.getProjectItems).mockResolvedValue([]);

    await queryBlockedItems(mockClient, mockConfig);

    // All three project fetches should be initiated
    expect(mockClient.getProject).toHaveBeenCalledTimes(3);

    // Since they run in parallel, the order depends on timing
    // but all three should be called
    expect(callOrder).toHaveLength(3);
    expect(callOrder.sort()).toEqual([1, 2, 3]);
  });

  it('completes within reasonable time for 5 projects', async () => {
    // Create a config with 5 projects
    const fiveProjectConfig: NormalizedConfig = {
      ...mockConfig,
      projects: [
        { name: 'Project1', org: 'testorg', projectNumber: 1, repos: ['testorg/p1'] },
        { name: 'Project2', org: 'testorg', projectNumber: 2, repos: ['testorg/p2'] },
        { name: 'Project3', org: 'testorg', projectNumber: 3, repos: ['testorg/p3'] },
        { name: 'Project4', org: 'testorg', projectNumber: 4, repos: ['testorg/p4'] },
        { name: 'Project5', org: 'testorg', projectNumber: 5, repos: ['testorg/p5'] },
      ],
    };

    // Simulate 100ms delay per project (would be 500ms total if serial)
    vi.mocked(mockClient.getProject).mockImplementation((org, projectNumber) => {
      return new Promise((resolve) => {
        setTimeout(() => resolve(createMockProjectContext(projectNumber)), 100);
      });
    });

    vi.mocked(mockClient.getProjectItems).mockResolvedValue([
      createMockItem(1, 'Task', 'In Progress'),
    ]);

    const startTime = Date.now();
    const result = await queryStandupSummary(mockClient, fiveProjectConfig);
    const elapsedTime = Date.now() - startTime;

    expect(result.success).toBe(true);
    expect(result.projectSummaries).toHaveLength(5);

    // Should complete in roughly 200ms (parallel) not 500ms+ (serial)
    // Allow some margin for test overhead
    expect(elapsedTime).toBeLessThan(500);
  });
});
