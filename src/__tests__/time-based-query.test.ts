import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseTimeRangePreset,
  parseTimeQuery,
  queryShippedItems,
  formatShippedItemsResponse,
  handleTimeBasedQuery,
} from '../queries/time-based.js';
import type {
  TimeRange,
  ShippedItemsResponse,
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

// Fixed reference date for testing: Wednesday, January 15, 2025
const REFERENCE_DATE = new Date('2025-01-15T12:00:00.000Z');

describe('parseTimeRangePreset', () => {
  it('parses "today" preset correctly', () => {
    const result = parseTimeRangePreset('today', REFERENCE_DATE);

    expect(result.description).toBe('today');
    expect(result.start.getDate()).toBe(15);
    expect(result.start.getMonth()).toBe(0); // January
    expect(result.start.getFullYear()).toBe(2025);
    expect(result.start.getHours()).toBe(0);
    expect(result.end.getHours()).toBe(23);
    expect(result.end.getMinutes()).toBe(59);
  });

  it('parses "this_week" preset correctly (starts Monday)', () => {
    const result = parseTimeRangePreset('this_week', REFERENCE_DATE);

    expect(result.description).toBe('this week');
    // Reference is Wednesday Jan 15, so Monday is Jan 13
    expect(result.start.getDate()).toBe(13);
    expect(result.start.getMonth()).toBe(0);
    expect(result.start.getFullYear()).toBe(2025);
  });

  it('parses "last_7_days" preset correctly', () => {
    const result = parseTimeRangePreset('last_7_days', REFERENCE_DATE);

    expect(result.description).toBe('last 7 days');
    // Reference is Jan 15, so start is Jan 9 (7 days including today)
    expect(result.start.getDate()).toBe(9);
  });

  it('parses "this_month" preset correctly', () => {
    const result = parseTimeRangePreset('this_month', REFERENCE_DATE);

    expect(result.description).toBe('this month');
    expect(result.start.getDate()).toBe(1);
    expect(result.start.getMonth()).toBe(0); // January
  });

  it('parses "last_month" preset correctly', () => {
    const result = parseTimeRangePreset('last_month', REFERENCE_DATE);

    expect(result.description).toBe('last month');
    expect(result.start.getDate()).toBe(1);
    expect(result.start.getMonth()).toBe(11); // December of previous year
    expect(result.start.getFullYear()).toBe(2024);
    expect(result.end.getDate()).toBe(31); // Last day of December
    expect(result.end.getMonth()).toBe(11);
  });

  it('parses "last_30_days" preset correctly', () => {
    const result = parseTimeRangePreset('last_30_days', REFERENCE_DATE);

    expect(result.description).toBe('last 30 days');
    // Reference is Jan 15, start should be Dec 17 (30 days including today)
    expect(result.start.getDate()).toBe(17);
    expect(result.start.getMonth()).toBe(11); // December
    expect(result.start.getFullYear()).toBe(2024);
  });

  it('handles Sunday correctly for this_week (full week from Monday)', () => {
    // Sunday, January 19, 2025
    const sundayRef = new Date('2025-01-19T12:00:00.000Z');
    const result = parseTimeRangePreset('this_week', sundayRef);

    // Monday of that week is Jan 13
    expect(result.start.getDate()).toBe(13);
    expect(result.start.getMonth()).toBe(0);
  });
});

describe('parseTimeQuery', () => {
  it('parses "what did I ship today?" correctly', () => {
    const result = parseTimeQuery('what did I ship today?', REFERENCE_DATE);

    expect(result.preset).toBe('today');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.timeRange).not.toBeNull();
    expect(result.timeRange?.description).toBe('today');
  });

  it('parses "what did I complete today?" correctly', () => {
    const result = parseTimeQuery('what did I complete today?', REFERENCE_DATE);

    expect(result.preset).toBe('today');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('parses "what did I ship this week?" correctly', () => {
    const result = parseTimeQuery('what did I ship this week?', REFERENCE_DATE);

    expect(result.preset).toBe('this_week');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.timeRange?.description).toBe('this week');
  });

  it('parses "what have I shipped this week" correctly', () => {
    const result = parseTimeQuery('what have I shipped this week', REFERENCE_DATE);

    expect(result.preset).toBe('this_week');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('parses "show me last month\'s completions" correctly', () => {
    const result = parseTimeQuery("show me last month's completions", REFERENCE_DATE);

    expect(result.preset).toBe('last_month');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('parses "what did I ship last month?" correctly', () => {
    const result = parseTimeQuery('what did I ship last month?', REFERENCE_DATE);

    expect(result.preset).toBe('last_month');
  });

  it('parses "show completed this month" correctly', () => {
    const result = parseTimeQuery('show me what was completed this month', REFERENCE_DATE);

    expect(result.preset).toBe('this_month');
  });

  it('parses "last 7 days" correctly', () => {
    const result = parseTimeQuery('show me completions from the last 7 days', REFERENCE_DATE);

    expect(result.preset).toBe('last_7_days');
  });

  it('parses "last 30 days" correctly', () => {
    const result = parseTimeQuery('what did I ship in the last 30 days?', REFERENCE_DATE);

    expect(result.preset).toBe('last_30_days');
  });

  it('parses "recent completions" as last 7 days', () => {
    const result = parseTimeQuery('show me recent completions', REFERENCE_DATE);

    expect(result.preset).toBe('last_7_days');
  });

  it('defaults generic "what did I ship?" to this week', () => {
    const result = parseTimeQuery('what did I ship?', REFERENCE_DATE);

    expect(result.preset).toBe('this_week');
    expect(result.confidence).toBeLessThan(0.9); // Lower confidence for default
  });

  it('returns null preset for unparseable queries', () => {
    const result = parseTimeQuery('hello world', REFERENCE_DATE);

    expect(result.preset).toBeNull();
    expect(result.timeRange).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it('preserves original query', () => {
    const query = 'what did I ship this week?';
    const result = parseTimeQuery(query, REFERENCE_DATE);

    expect(result.originalQuery).toBe(query);
  });
});

describe('queryShippedItems', () => {
  let mockClient: GitHubClient;

  beforeEach(() => {
    mockClient = {
      getProject: vi.fn(),
      getProjectItems: vi.fn(),
    } as unknown as GitHubClient;
  });

  it('returns shipped items from all projects within time range', async () => {
    const timeRange: TimeRange = {
      start: new Date('2025-01-13T00:00:00.000Z'),
      end: new Date('2025-01-15T23:59:59.999Z'),
      description: 'this week',
    };

    vi.mocked(mockClient.getProject).mockImplementation((org, projectNumber) => {
      return Promise.resolve(createMockProjectContext(projectNumber));
    });

    vi.mocked(mockClient.getProjectItems).mockImplementation((projectId) => {
      if (projectId === 'proj-1') {
        // DocuGen - 2 items closed in range
        return Promise.resolve([
          createMockItem(12, 'PDF extraction', 'Done', {
            closedAt: '2025-01-13T10:00:00.000Z',
            state: 'CLOSED',
          }),
          createMockItem(8, 'Template system', 'Done', {
            closedAt: '2025-01-14T15:00:00.000Z',
            state: 'CLOSED',
          }),
          createMockItem(20, 'Still in progress', 'In Progress'),
        ]);
      } else if (projectId === 'proj-2') {
        // CoreLib - 1 item closed in range
        return Promise.resolve([
          createMockItem(5, 'Auth refactor', 'Done', {
            closedAt: '2025-01-15T09:00:00.000Z',
            state: 'CLOSED',
          }),
        ]);
      } else {
        // API Platform - item closed outside range
        return Promise.resolve([
          createMockItem(3, 'Old task', 'Done', {
            closedAt: '2025-01-01T10:00:00.000Z',
            state: 'CLOSED',
          }),
        ]);
      }
    });

    const result = await queryShippedItems(mockClient, mockConfig, timeRange);

    expect(result.success).toBe(true);
    expect(result.totalShipped).toBe(3);

    // Check DocuGen summary
    const docuGen = result.projectSummaries.find((s) => s.projectName === 'DocuGen');
    expect(docuGen?.count).toBe(2);
    expect(docuGen?.items).toHaveLength(2);

    // Check CoreLib summary
    const coreLib = result.projectSummaries.find((s) => s.projectName === 'CoreLib');
    expect(coreLib?.count).toBe(1);
    expect(coreLib?.items[0].title).toBe('Auth refactor');

    // API Platform should have 0 (closed outside range)
    const apiPlatform = result.projectSummaries.find((s) => s.projectName === 'API Platform');
    expect(apiPlatform?.count).toBe(0);
  });

  it('returns empty list when no items shipped in range', async () => {
    const timeRange: TimeRange = {
      start: new Date('2025-01-13T00:00:00.000Z'),
      end: new Date('2025-01-15T23:59:59.999Z'),
      description: 'this week',
    };

    vi.mocked(mockClient.getProject).mockImplementation((org, projectNumber) => {
      return Promise.resolve(createMockProjectContext(projectNumber));
    });

    vi.mocked(mockClient.getProjectItems).mockResolvedValue([
      createMockItem(1, 'Old task', 'Done', {
        closedAt: '2024-12-01T10:00:00.000Z',
        state: 'CLOSED',
      }),
      createMockItem(2, 'Still open', 'In Progress'),
    ]);

    const result = await queryShippedItems(mockClient, mockConfig, timeRange);

    expect(result.success).toBe(true);
    expect(result.totalShipped).toBe(0);
  });

  it('filters by project names when specified', async () => {
    const timeRange: TimeRange = {
      start: new Date('2025-01-13T00:00:00.000Z'),
      end: new Date('2025-01-15T23:59:59.999Z'),
      description: 'this week',
    };

    vi.mocked(mockClient.getProject).mockImplementation((org, projectNumber) => {
      return Promise.resolve(createMockProjectContext(projectNumber));
    });

    vi.mocked(mockClient.getProjectItems).mockResolvedValue([
      createMockItem(1, 'Task', 'Done', {
        closedAt: '2025-01-14T10:00:00.000Z',
        state: 'CLOSED',
      }),
    ]);

    const result = await queryShippedItems(mockClient, mockConfig, timeRange, {
      projectNames: ['DocuGen'],
    });

    expect(result.success).toBe(true);
    expect(result.projectSummaries).toHaveLength(1);
    expect(result.projectSummaries[0].projectName).toBe('DocuGen');
  });

  it('handles failed projects gracefully', async () => {
    const timeRange: TimeRange = {
      start: new Date('2025-01-13T00:00:00.000Z'),
      end: new Date('2025-01-15T23:59:59.999Z'),
      description: 'this week',
    };

    vi.mocked(mockClient.getProject).mockImplementation((org, projectNumber) => {
      if (projectNumber === 2) {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve(createMockProjectContext(projectNumber));
    });

    vi.mocked(mockClient.getProjectItems).mockResolvedValue([
      createMockItem(1, 'Task', 'Done', {
        closedAt: '2025-01-14T10:00:00.000Z',
        state: 'CLOSED',
      }),
    ]);

    const result = await queryShippedItems(mockClient, mockConfig, timeRange, {
      continueOnError: true,
    });

    expect(result.success).toBe(true);

    // CoreLib should show as failed
    const coreLib = result.projectSummaries.find((s) => s.projectName === 'CoreLib');
    expect(coreLib?.success).toBe(false);
    expect(coreLib?.error).toContain('Network error');

    // Others should still have items
    expect(result.totalShipped).toBe(2); // DocuGen and API Platform
  });

  it('handles timeout correctly', async () => {
    const timeRange: TimeRange = {
      start: new Date('2025-01-13T00:00:00.000Z'),
      end: new Date('2025-01-15T23:59:59.999Z'),
      description: 'this week',
    };

    vi.mocked(mockClient.getProject).mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(() => resolve(createMockProjectContext(1)), 500);
      });
    });

    const result = await queryShippedItems(mockClient, mockConfig, timeRange, {
      timeoutMs: 100,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
  });

  it('sorts shipped items by closedAt descending', async () => {
    const timeRange: TimeRange = {
      start: new Date('2025-01-13T00:00:00.000Z'),
      end: new Date('2025-01-15T23:59:59.999Z'),
      description: 'this week',
    };

    vi.mocked(mockClient.getProject).mockResolvedValue(createMockProjectContext(1));

    vi.mocked(mockClient.getProjectItems).mockResolvedValue([
      createMockItem(1, 'First closed', 'Done', {
        closedAt: '2025-01-13T10:00:00.000Z',
        state: 'CLOSED',
      }),
      createMockItem(2, 'Second closed', 'Done', {
        closedAt: '2025-01-14T10:00:00.000Z',
        state: 'CLOSED',
      }),
      createMockItem(3, 'Third closed', 'Done', {
        closedAt: '2025-01-15T10:00:00.000Z',
        state: 'CLOSED',
      }),
    ]);

    const result = await queryShippedItems(mockClient, mockConfig, timeRange, {
      projectNames: ['DocuGen'],
    });

    const docuGen = result.projectSummaries[0];
    expect(docuGen.items[0].title).toBe('Third closed'); // Most recent first
    expect(docuGen.items[1].title).toBe('Second closed');
    expect(docuGen.items[2].title).toBe('First closed');
  });

  it('includes correct day of week in shipped items', async () => {
    const timeRange: TimeRange = {
      start: new Date('2025-01-13T00:00:00.000Z'),
      end: new Date('2025-01-15T23:59:59.999Z'),
      description: 'this week',
    };

    vi.mocked(mockClient.getProject).mockResolvedValue(createMockProjectContext(1));

    vi.mocked(mockClient.getProjectItems).mockResolvedValue([
      createMockItem(1, 'Monday task', 'Done', {
        closedAt: '2025-01-13T10:00:00.000Z', // Monday
        state: 'CLOSED',
      }),
      createMockItem(2, 'Tuesday task', 'Done', {
        closedAt: '2025-01-14T10:00:00.000Z', // Tuesday
        state: 'CLOSED',
      }),
      createMockItem(3, 'Wednesday task', 'Done', {
        closedAt: '2025-01-15T10:00:00.000Z', // Wednesday
        state: 'CLOSED',
      }),
    ]);

    const result = await queryShippedItems(mockClient, mockConfig, timeRange, {
      projectNames: ['DocuGen'],
    });

    const items = result.projectSummaries[0].items;
    expect(items.find((i) => i.title === 'Monday task')?.closedDay).toBe('Mon');
    expect(items.find((i) => i.title === 'Tuesday task')?.closedDay).toBe('Tue');
    expect(items.find((i) => i.title === 'Wednesday task')?.closedDay).toBe('Wed');
  });
});

describe('formatShippedItemsResponse', () => {
  it('formats shipped items correctly', () => {
    const response: ShippedItemsResponse = {
      success: true,
      projectSummaries: [
        {
          projectName: 'DocuGen',
          items: [
            {
              number: 12,
              title: 'PDF extraction',
              url: 'https://example.com/12',
              projectName: 'DocuGen',
              closedAt: new Date('2025-01-13T10:00:00.000Z'),
              closedDay: 'Mon',
            },
            {
              number: 8,
              title: 'Template system',
              url: 'https://example.com/8',
              projectName: 'DocuGen',
              closedAt: new Date('2025-01-14T15:00:00.000Z'),
              closedDay: 'Tue',
            },
          ],
          count: 2,
          success: true,
        },
        {
          projectName: 'CoreLib',
          items: [
            {
              number: 5,
              title: 'Auth refactor',
              url: 'https://example.com/5',
              projectName: 'CoreLib',
              closedAt: new Date('2025-01-15T09:00:00.000Z'),
              closedDay: 'Wed',
            },
          ],
          count: 1,
          success: true,
        },
      ],
      totalShipped: 3,
      timeRange: {
        start: new Date('2025-01-13T00:00:00.000Z'),
        end: new Date('2025-01-15T23:59:59.999Z'),
        description: 'this week',
      },
      fetchedAt: new Date(),
    };

    const formatted = formatShippedItemsResponse(response);

    expect(formatted).toContain('What you shipped this week:');
    expect(formatted).toContain('DocuGen:');
    expect(formatted).toContain('- PDF extraction (#12) - closed Mon');
    expect(formatted).toContain('- Template system (#8) - closed Tue');
    expect(formatted).toContain('CoreLib:');
    expect(formatted).toContain('- Auth refactor (#5) - closed Wed');
    expect(formatted).toContain('Total: 3 items shipped');
  });

  it('formats empty shipped items correctly', () => {
    const response: ShippedItemsResponse = {
      success: true,
      projectSummaries: [
        { projectName: 'DocuGen', items: [], count: 0, success: true },
        { projectName: 'CoreLib', items: [], count: 0, success: true },
      ],
      totalShipped: 0,
      timeRange: {
        start: new Date('2025-01-13T00:00:00.000Z'),
        end: new Date('2025-01-15T23:59:59.999Z'),
        description: 'this week',
      },
      fetchedAt: new Date(),
    };

    const formatted = formatShippedItemsResponse(response);

    expect(formatted).toContain('What you shipped this week:');
    expect(formatted).toContain('No items shipped');
  });

  it('formats error response correctly', () => {
    const response: ShippedItemsResponse = {
      success: false,
      error: 'API rate limited',
      projectSummaries: [],
      totalShipped: 0,
      timeRange: {
        start: new Date('2025-01-13T00:00:00.000Z'),
        end: new Date('2025-01-15T23:59:59.999Z'),
        description: 'this week',
      },
      fetchedAt: new Date(),
    };

    const formatted = formatShippedItemsResponse(response);

    expect(formatted).toContain('Unable to fetch shipped items');
    expect(formatted).toContain('API rate limited');
  });

  it('shows failed projects', () => {
    const response: ShippedItemsResponse = {
      success: true,
      projectSummaries: [
        {
          projectName: 'DocuGen',
          items: [
            {
              number: 12,
              title: 'Task',
              url: 'https://example.com/12',
              projectName: 'DocuGen',
              closedAt: new Date('2025-01-13T10:00:00.000Z'),
              closedDay: 'Mon',
            },
          ],
          count: 1,
          success: true,
        },
        {
          projectName: 'CoreLib',
          items: [],
          count: 0,
          success: false,
          error: 'Permission denied',
        },
      ],
      totalShipped: 1,
      timeRange: {
        start: new Date('2025-01-13T00:00:00.000Z'),
        end: new Date('2025-01-15T23:59:59.999Z'),
        description: 'this week',
      },
      fetchedAt: new Date(),
    };

    const formatted = formatShippedItemsResponse(response);

    expect(formatted).toContain('CoreLib: (failed to fetch: Permission denied)');
  });

  it('uses singular "item" for single shipped item', () => {
    const response: ShippedItemsResponse = {
      success: true,
      projectSummaries: [
        {
          projectName: 'DocuGen',
          items: [
            {
              number: 1,
              title: 'Task',
              url: 'https://example.com/1',
              projectName: 'DocuGen',
              closedAt: new Date('2025-01-13T10:00:00.000Z'),
              closedDay: 'Mon',
            },
          ],
          count: 1,
          success: true,
        },
      ],
      totalShipped: 1,
      timeRange: {
        start: new Date('2025-01-13T00:00:00.000Z'),
        end: new Date('2025-01-15T23:59:59.999Z'),
        description: 'this week',
      },
      fetchedAt: new Date(),
    };

    const formatted = formatShippedItemsResponse(response);

    expect(formatted).toContain('Total: 1 item shipped');
    expect(formatted).not.toContain('items shipped');
  });
});

describe('handleTimeBasedQuery', () => {
  let mockClient: GitHubClient;

  beforeEach(() => {
    mockClient = {
      getProject: vi.fn(),
      getProjectItems: vi.fn(),
    } as unknown as GitHubClient;
  });

  it('handles "what did I ship this week?" end-to-end', async () => {
    vi.mocked(mockClient.getProject).mockResolvedValue(createMockProjectContext(1));

    vi.mocked(mockClient.getProjectItems).mockResolvedValue([
      createMockItem(1, 'Task', 'Done', {
        closedAt: '2025-01-14T10:00:00.000Z',
        state: 'CLOSED',
      }),
    ]);

    const result = await handleTimeBasedQuery(
      'what did I ship this week?',
      mockClient,
      mockConfig,
      { referenceDate: REFERENCE_DATE }
    );

    expect(result.success).toBe(true);
    expect(result.timeRange.description).toBe('this week');
  });

  it('defaults to this week for unparseable query', async () => {
    vi.mocked(mockClient.getProject).mockResolvedValue(createMockProjectContext(1));
    vi.mocked(mockClient.getProjectItems).mockResolvedValue([]);

    const result = await handleTimeBasedQuery(
      'hello world',
      mockClient,
      mockConfig,
      { referenceDate: REFERENCE_DATE }
    );

    expect(result.success).toBe(true);
    expect(result.timeRange.description).toBe('this week');
  });

  it('handles "today" queries correctly', async () => {
    vi.mocked(mockClient.getProject).mockResolvedValue(createMockProjectContext(1));
    vi.mocked(mockClient.getProjectItems).mockResolvedValue([]);

    const result = await handleTimeBasedQuery(
      'what did I ship today?',
      mockClient,
      mockConfig,
      { referenceDate: REFERENCE_DATE }
    );

    expect(result.success).toBe(true);
    expect(result.timeRange.description).toBe('today');
  });
});

describe('Edge cases', () => {
  let mockClient: GitHubClient;

  beforeEach(() => {
    mockClient = {
      getProject: vi.fn(),
      getProjectItems: vi.fn(),
    } as unknown as GitHubClient;
  });

  it('handles items without closedAt field', async () => {
    const timeRange: TimeRange = {
      start: new Date('2025-01-13T00:00:00.000Z'),
      end: new Date('2025-01-15T23:59:59.999Z'),
      description: 'this week',
    };

    vi.mocked(mockClient.getProject).mockResolvedValue(createMockProjectContext(1));

    // Item in Done status but no closedAt
    vi.mocked(mockClient.getProjectItems).mockResolvedValue([
      createMockItem(1, 'No closed date', 'Done', { state: 'CLOSED' }),
    ]);

    const result = await queryShippedItems(mockClient, mockConfig, timeRange, {
      projectNames: ['DocuGen'],
    });

    expect(result.success).toBe(true);
    expect(result.totalShipped).toBe(0); // Should not include items without closedAt
  });

  it('handles items with status not matching Done', async () => {
    const timeRange: TimeRange = {
      start: new Date('2025-01-13T00:00:00.000Z'),
      end: new Date('2025-01-15T23:59:59.999Z'),
      description: 'this week',
    };

    vi.mocked(mockClient.getProject).mockResolvedValue(createMockProjectContext(1));

    // Item closed but not in Done status
    vi.mocked(mockClient.getProjectItems).mockResolvedValue([
      createMockItem(1, 'Closed but in progress', 'In Progress', {
        closedAt: '2025-01-14T10:00:00.000Z',
        state: 'CLOSED',
      }),
    ]);

    const result = await queryShippedItems(mockClient, mockConfig, timeRange, {
      projectNames: ['DocuGen'],
    });

    expect(result.success).toBe(true);
    expect(result.totalShipped).toBe(0); // Status must be Done
  });

  it('handles partial week at month boundary', async () => {
    // Reference date is Jan 1, 2025 (Wednesday) - week starts Dec 30, 2024
    const jan1 = new Date('2025-01-01T12:00:00.000Z');
    const timeRange = parseTimeRangePreset('this_week', jan1);

    expect(timeRange.start.getFullYear()).toBe(2024);
    expect(timeRange.start.getMonth()).toBe(11); // December
    expect(timeRange.start.getDate()).toBe(30); // Monday, Dec 30
  });

  it('handles timezone edge cases by using date comparison', async () => {
    const timeRange: TimeRange = {
      start: new Date('2025-01-15T00:00:00.000Z'),
      end: new Date('2025-01-15T23:59:59.999Z'),
      description: 'today',
    };

    vi.mocked(mockClient.getProject).mockResolvedValue(createMockProjectContext(1));

    // Item closed exactly at start of range
    vi.mocked(mockClient.getProjectItems).mockResolvedValue([
      createMockItem(1, 'Edge case start', 'Done', {
        closedAt: '2025-01-15T00:00:00.000Z',
        state: 'CLOSED',
      }),
      createMockItem(2, 'Edge case end', 'Done', {
        closedAt: '2025-01-15T23:59:59.999Z',
        state: 'CLOSED',
      }),
    ]);

    const result = await queryShippedItems(mockClient, mockConfig, timeRange, {
      projectNames: ['DocuGen'],
    });

    expect(result.success).toBe(true);
    expect(result.totalShipped).toBe(2); // Both should be included
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

    const timeRange: TimeRange = {
      start: new Date('2025-01-13T00:00:00.000Z'),
      end: new Date('2025-01-15T23:59:59.999Z'),
      description: 'this week',
    };

    await queryShippedItems(mockClient, mockConfig, timeRange);

    // All three project fetches should be initiated
    expect(mockClient.getProject).toHaveBeenCalledTimes(3);
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
      createMockItem(1, 'Task', 'Done', {
        closedAt: '2025-01-14T10:00:00.000Z',
        state: 'CLOSED',
      }),
    ]);

    const timeRange: TimeRange = {
      start: new Date('2025-01-13T00:00:00.000Z'),
      end: new Date('2025-01-15T23:59:59.999Z'),
      description: 'this week',
    };

    const startTime = Date.now();
    const result = await queryShippedItems(mockClient, fiveProjectConfig, timeRange);
    const elapsedTime = Date.now() - startTime;

    expect(result.success).toBe(true);
    expect(result.projectSummaries).toHaveLength(5);

    // Should complete in roughly 200ms (parallel) not 500ms+ (serial)
    expect(elapsedTime).toBeLessThan(500);
  });
});
