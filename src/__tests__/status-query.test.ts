import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseProjectQuery,
  findProject,
  queryProjectStatus,
  handleStatusQuery,
  formatStatusResponse,
} from '../queries/status.js';
import type { ProjectStatusResponse } from '../queries/types.js';
import type { NormalizedConfig } from '../types/config.js';
import type { ProjectItem, IssueContent } from '../github/types.js';
import type { GitHubClient } from '../github/client.js';

// Mock configuration
const mockConfig: NormalizedConfig = {
  github: { token: 'test-token' },
  projects: [
    { name: 'DocuGen', org: 'testorg', projectNumber: 1, repos: ['testorg/docugen'] },
    { name: 'API Platform', org: 'testorg', projectNumber: 2, repos: ['testorg/api'] },
    { name: 'TestProject', org: 'testorg', projectNumber: 3, repos: ['testorg/test'] },
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

describe('parseProjectQuery', () => {
  it('parses "What\'s the status on [project]?" format', () => {
    const result = parseProjectQuery("What's the status on DocuGen?");
    expect(result.projectName).toBe('DocuGen');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('parses "What is the status of [project]?" format', () => {
    const result = parseProjectQuery('What is the status of API Platform?');
    expect(result.projectName).toBe('API Platform');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('parses "status on [project]" format', () => {
    const result = parseProjectQuery('status on DocuGen');
    expect(result.projectName).toBe('DocuGen');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('parses "How\'s [project] doing?" format', () => {
    const result = parseProjectQuery("How's DocuGen doing?");
    expect(result.projectName).toBe('DocuGen');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('parses "show me status of [project]" format', () => {
    const result = parseProjectQuery('show me status of TestProject');
    expect(result.projectName).toBe('TestProject');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('parses quoted project names', () => {
    const result = parseProjectQuery('What\'s the status on "My Project"?');
    expect(result.projectName).toBe('My Project');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('extracts capitalized words as fallback', () => {
    const result = parseProjectQuery('tell me about DocuGen');
    expect(result.projectName).toBe('DocuGen');
    expect(result.confidence).toBe(0.5);
  });

  it('returns empty string with zero confidence for unparseable queries', () => {
    const result = parseProjectQuery('hello world');
    expect(result.projectName).toBe('');
    expect(result.confidence).toBe(0);
  });

  it('preserves original query', () => {
    const query = "What's the status on DocuGen?";
    const result = parseProjectQuery(query);
    expect(result.originalQuery).toBe(query);
  });
});

describe('findProject', () => {
  it('finds project by exact name', () => {
    const project = findProject(mockConfig, 'DocuGen');
    expect(project).toBeDefined();
    expect(project?.name).toBe('DocuGen');
  });

  it('finds project case-insensitively', () => {
    const project = findProject(mockConfig, 'docugen');
    expect(project).toBeDefined();
    expect(project?.name).toBe('DocuGen');
  });

  it('finds project by partial match', () => {
    const project = findProject(mockConfig, 'API');
    expect(project).toBeDefined();
    expect(project?.name).toBe('API Platform');
  });

  it('returns undefined for unknown project', () => {
    const project = findProject(mockConfig, 'NonExistent');
    expect(project).toBeUndefined();
  });
});

describe('formatStatusResponse', () => {
  it('formats successful response with items', () => {
    const response: ProjectStatusResponse = {
      projectName: 'DocuGen',
      success: true,
      categories: [
        {
          name: 'In Progress',
          count: 3,
          items: [
            { number: 12, title: 'PDF extraction', url: 'https://example.com/12' },
            { number: 8, title: 'Template system', url: 'https://example.com/8' },
            { number: 15, title: 'API docs', url: 'https://example.com/15' },
          ],
          hasMore: false,
        },
        {
          name: 'Blocked',
          count: 1,
          items: [
            {
              number: 7,
              title: 'Export module',
              url: 'https://example.com/7',
              note: 'waiting on design review',
            },
          ],
          hasMore: false,
        },
        {
          name: 'Done this week',
          count: 5,
          items: [
            { number: 1, title: 'Task 1', url: 'https://example.com/1' },
            { number: 3, title: 'Task 3', url: 'https://example.com/3' },
            { number: 4, title: 'Task 4', url: 'https://example.com/4' },
          ],
          hasMore: true,
        },
      ],
      totalItems: 9,
      fetchedAt: new Date(),
    };

    const formatted = formatStatusResponse(response);

    expect(formatted).toContain('DocuGen Status:');
    expect(formatted).toContain('In Progress (3)');
    expect(formatted).toContain('PDF extraction (#12)');
    expect(formatted).toContain('Template system (#8)');
    expect(formatted).toContain('Blocked (1)');
    expect(formatted).toContain('Export module (#7) - waiting on design review');
    expect(formatted).toContain('Done this week (5)');
    expect(formatted).toContain('...');
  });

  it('formats error response', () => {
    const response: ProjectStatusResponse = {
      projectName: 'Unknown',
      success: false,
      error: 'Project not found',
      categories: [],
      totalItems: 0,
      fetchedAt: new Date(),
    };

    const formatted = formatStatusResponse(response);

    expect(formatted).toContain('Unable to get status');
    expect(formatted).toContain('Project not found');
  });

  it('handles empty categories', () => {
    const response: ProjectStatusResponse = {
      projectName: 'EmptyProject',
      success: true,
      categories: [
        { name: 'In Progress', count: 0, items: [], hasMore: false },
        { name: 'Blocked', count: 0, items: [], hasMore: false },
      ],
      totalItems: 0,
      fetchedAt: new Date(),
    };

    const formatted = formatStatusResponse(response);

    expect(formatted).toContain('EmptyProject Status:');
    expect(formatted).toContain('No items found');
  });
});

describe('queryProjectStatus', () => {
  let mockClient: GitHubClient;

  beforeEach(() => {
    mockClient = {
      getProject: vi.fn(),
      getProjectItems: vi.fn(),
    } as unknown as GitHubClient;
  });

  it('returns error for unknown project', async () => {
    const result = await queryProjectStatus(mockClient, mockConfig, 'UnknownProject');

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
    expect(result.error).toContain('DocuGen');
    expect(result.categories).toHaveLength(0);
  });

  it('returns project status with items grouped by status', async () => {
    vi.mocked(mockClient.getProject).mockResolvedValue({
      projectId: 'proj-1',
      projectNumber: 1,
      statusFieldId: 'field-status',
      statusOptions: new Map([
        ['in progress', 'opt-1'],
        ['blocked', 'opt-2'],
        ['done', 'opt-3'],
      ]),
      cachedAt: Date.now(),
    });

    const mockItems: ProjectItem[] = [
      createMockItem(12, 'PDF extraction', 'In Progress'),
      createMockItem(8, 'Template system', 'In Progress'),
      createMockItem(15, 'API docs', 'In Progress'),
      createMockItem(7, 'Export module', 'Blocked', { labels: ['blocked:design review'] }),
      createMockItem(1, 'Task 1', 'Done', {
        state: 'CLOSED',
        closedAt: new Date().toISOString(),
      }),
    ];

    vi.mocked(mockClient.getProjectItems).mockResolvedValue(mockItems);

    const result = await queryProjectStatus(mockClient, mockConfig, 'DocuGen');

    expect(result.success).toBe(true);
    expect(result.projectName).toBe('DocuGen');
    expect(result.totalItems).toBe(5);

    const inProgress = result.categories.find((c) => c.name === 'In Progress');
    expect(inProgress).toBeDefined();
    expect(inProgress?.count).toBe(3);

    const blocked = result.categories.find((c) => c.name === 'Blocked');
    expect(blocked).toBeDefined();
    expect(blocked?.count).toBe(1);
    expect(blocked?.items[0]?.note).toContain('waiting on');
  });

  it('limits items per category to maxItemsPerCategory', async () => {
    vi.mocked(mockClient.getProject).mockResolvedValue({
      projectId: 'proj-1',
      projectNumber: 1,
      statusFieldId: 'field-status',
      statusOptions: new Map([['in progress', 'opt-1']]),
      cachedAt: Date.now(),
    });

    // Create 10 items in progress
    const mockItems: ProjectItem[] = [];
    for (let i = 1; i <= 10; i++) {
      mockItems.push(createMockItem(i, `Task ${i}`, 'In Progress'));
    }

    vi.mocked(mockClient.getProjectItems).mockResolvedValue(mockItems);

    const result = await queryProjectStatus(mockClient, mockConfig, 'DocuGen', {
      maxItemsPerCategory: 3,
    });

    expect(result.success).toBe(true);
    const inProgress = result.categories.find((c) => c.name === 'In Progress');
    expect(inProgress?.count).toBe(10);
    expect(inProgress?.items).toHaveLength(3);
    expect(inProgress?.hasMore).toBe(true);
  });

  it('handles API errors gracefully', async () => {
    vi.mocked(mockClient.getProject).mockRejectedValue(new Error('API rate limited'));

    const result = await queryProjectStatus(mockClient, mockConfig, 'DocuGen');

    expect(result.success).toBe(false);
    expect(result.error).toContain('API rate limited');
  });

  it('includes done this week category', async () => {
    vi.mocked(mockClient.getProject).mockResolvedValue({
      projectId: 'proj-1',
      projectNumber: 1,
      statusFieldId: 'field-status',
      statusOptions: new Map([['done', 'opt-1']]),
      cachedAt: Date.now(),
    });

    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 2); // 2 days ago

    const mockItems: ProjectItem[] = [
      createMockItem(1, 'Recent task', 'Done', {
        state: 'CLOSED',
        closedAt: recentDate.toISOString(),
      }),
    ];

    vi.mocked(mockClient.getProjectItems).mockResolvedValue(mockItems);

    const result = await queryProjectStatus(mockClient, mockConfig, 'DocuGen', {
      includeDoneThisWeek: true,
    });

    expect(result.success).toBe(true);
    const doneThisWeek = result.categories.find((c) => c.name === 'Done this week');
    expect(doneThisWeek).toBeDefined();
    expect(doneThisWeek?.count).toBe(1);
  });
});

describe('handleStatusQuery', () => {
  let mockClient: GitHubClient;

  beforeEach(() => {
    mockClient = {
      getProject: vi.fn(),
      getProjectItems: vi.fn(),
    } as unknown as GitHubClient;
  });

  it('handles natural language query end-to-end', async () => {
    vi.mocked(mockClient.getProject).mockResolvedValue({
      projectId: 'proj-1',
      projectNumber: 1,
      statusFieldId: 'field-status',
      statusOptions: new Map([['in progress', 'opt-1']]),
      cachedAt: Date.now(),
    });

    vi.mocked(mockClient.getProjectItems).mockResolvedValue([
      createMockItem(1, 'Task 1', 'In Progress'),
    ]);

    const result = await handleStatusQuery(
      "What's the status on DocuGen?",
      mockClient,
      mockConfig
    );

    expect(result.success).toBe(true);
    expect(result.projectName).toBe('DocuGen');
  });

  it('returns error for unparseable query', async () => {
    const result = await handleStatusQuery('hello world', mockClient, mockConfig);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Could not identify');
  });

  it('returns error for low confidence parse', async () => {
    // This query has no recognizable patterns or capitalized words
    const result = await handleStatusQuery('what about that thing', mockClient, mockConfig);

    expect(result.success).toBe(false);
  });
});
