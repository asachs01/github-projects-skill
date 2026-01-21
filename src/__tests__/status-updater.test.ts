import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProjectItem, IssueContent } from '../github/types.js';

// Create mock functions for GitHubClient methods
const mockGetProject = vi.fn();
const mockGetProjectItems = vi.fn();
const mockUpdateItemStatus = vi.fn();
const mockClearCache = vi.fn();

// Mock the GitHubClient class
vi.mock('../github/client.js', async () => {
  const actual = await vi.importActual<typeof import('../github/client.js')>('../github/client.js');
  return {
    ...actual,
    GitHubClient: class MockGitHubClient {
      constructor() {
        // Constructor does nothing in mock
      }
      getProject = mockGetProject;
      getProjectItems = mockGetProjectItems;
      updateItemStatus = mockUpdateItemStatus;
      clearCache = mockClearCache;
    },
  };
});

// Import after mocking
import {
  StatusUpdater,
  createStatusUpdater,
  findBestMatch,
  findMatches,
  getSuggestions,
  calculateMatchScore,
  levenshteinDistance,
  levenshteinSimilarity,
  normalizeString,
  parseNumberQuery,
  findByNumber,
  ItemNotFoundError,
  AmbiguousMatchError,
  InvalidStatusError,
} from '../updates/index.js';
import { GitHubClientError } from '../github/client.js';

/**
 * Helper to create mock project items
 */
function createMockItem(
  id: string,
  number: number,
  title: string,
  status?: string
): ProjectItem {
  const content: IssueContent = {
    id: `issue-${id}`,
    number,
    title,
    url: `https://github.com/owner/repo/issues/${number}`,
    state: 'OPEN',
    labels: { nodes: [] },
    assignees: { nodes: [] },
    updatedAt: '2024-01-01T00:00:00Z',
    closedAt: null,
  };

  const fieldValues: ProjectItem['fieldValues'] = {
    nodes: status
      ? [{
          name: status,
          optionId: `option-${status.toLowerCase().replace(/\s+/g, '-')}`,
          field: { name: 'Status' },
        }]
      : [],
  };

  return { id, fieldValues, content };
}

// Sample mock items for testing
const mockItems: ProjectItem[] = [
  createMockItem('item-1', 1, 'Implement API documentation', 'Todo'),
  createMockItem('item-2', 2, 'Fix PDF extraction bug', 'In Progress'),
  createMockItem('item-3', 3, 'Add user authentication', 'Todo'),
  createMockItem('item-4', 12, 'Update database schema', 'Done'),
  createMockItem('item-5', 5, 'Write unit tests for API', 'Todo'),
  createMockItem('item-6', 6, 'API endpoint optimization', 'Blocked'),
  createMockItem('item-7', 7, 'Document API endpoints', 'Todo'),
];

// Mock project context
const mockProjectContext = {
  projectId: 'mock-project-id',
  projectNumber: 1,
  statusFieldId: 'mock-status-field-id',
  statusOptions: new Map([
    ['todo', 'option-todo'],
    ['in progress', 'option-in-progress'],
    ['done', 'option-done'],
    ['blocked', 'option-blocked'],
  ]),
  cachedAt: Date.now(),
};

describe('Fuzzy Matcher Utilities', () => {
  describe('normalizeString', () => {
    it('converts to lowercase and trims', () => {
      expect(normalizeString('  Hello World  ')).toBe('hello world');
    });

    it('collapses multiple spaces', () => {
      expect(normalizeString('hello   world')).toBe('hello world');
    });
  });

  describe('levenshteinDistance', () => {
    it('returns 0 for identical strings', () => {
      expect(levenshteinDistance('hello', 'hello')).toBe(0);
    });

    it('calculates correct distance for single character difference', () => {
      expect(levenshteinDistance('hello', 'hallo')).toBe(1);
    });

    it('calculates distance for completely different strings', () => {
      expect(levenshteinDistance('abc', 'xyz')).toBe(3);
    });

    it('handles empty strings', () => {
      expect(levenshteinDistance('', 'hello')).toBe(5);
      expect(levenshteinDistance('hello', '')).toBe(5);
    });
  });

  describe('levenshteinSimilarity', () => {
    it('returns 1 for identical strings', () => {
      expect(levenshteinSimilarity('hello', 'hello')).toBe(1);
    });

    it('returns high score for similar strings', () => {
      const score = levenshteinSimilarity('hello', 'hallo');
      expect(score).toBeGreaterThan(0.7);
    });

    it('handles case insensitivity', () => {
      expect(levenshteinSimilarity('Hello', 'hello')).toBe(1);
    });
  });

  describe('parseNumberQuery', () => {
    it('parses issue number with hash', () => {
      expect(parseNumberQuery('#12')).toBe(12);
    });

    it('parses issue number without hash', () => {
      expect(parseNumberQuery('42')).toBe(42);
    });

    it('returns null for non-number queries', () => {
      expect(parseNumberQuery('api docs')).toBeNull();
    });

    it('handles whitespace', () => {
      expect(parseNumberQuery('  #12  ')).toBe(12);
    });
  });

  describe('calculateMatchScore', () => {
    it('returns 1 for exact match', () => {
      expect(calculateMatchScore('API Documentation', 'API Documentation')).toBe(1);
    });

    it('returns 1 for case-insensitive exact match', () => {
      expect(calculateMatchScore('API Documentation', 'api documentation')).toBe(1);
    });

    it('returns high score for prefix match', () => {
      const score = calculateMatchScore('API Documentation Guide', 'API Documentation');
      expect(score).toBeGreaterThan(0.9);
    });

    it('returns good score for substring match', () => {
      const score = calculateMatchScore('Implement API Documentation', 'API Doc');
      expect(score).toBeGreaterThan(0.7);
    });

    it('returns moderate score for word overlap', () => {
      const score = calculateMatchScore('Fix PDF extraction bug', 'PDF extraction');
      expect(score).toBeGreaterThan(0.5);
    });

    it('returns low score for dissimilar strings', () => {
      const score = calculateMatchScore('User authentication', 'Database migration');
      expect(score).toBeLessThan(0.3);
    });
  });

  describe('findByNumber', () => {
    it('finds item by exact number', () => {
      const result = findByNumber(mockItems, 12);
      expect(result).not.toBeNull();
      expect(result?.content?.number).toBe(12);
    });

    it('returns null for non-existent number', () => {
      const result = findByNumber(mockItems, 999);
      expect(result).toBeNull();
    });
  });

  describe('findMatches', () => {
    it('finds items by issue number', () => {
      const matches = findMatches(mockItems, '#12');
      expect(matches).toHaveLength(1);
      expect(matches[0].number).toBe(12);
      expect(matches[0].score).toBe(1);
    });

    it('finds items by partial title', () => {
      const matches = findMatches(mockItems, 'API docs');
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].title).toContain('API');
    });

    it('returns empty array for no matches', () => {
      const matches = findMatches(mockItems, 'nonexistent task xyz');
      expect(matches).toHaveLength(0);
    });

    it('sorts results by score descending', () => {
      const matches = findMatches(mockItems, 'API');
      for (let i = 1; i < matches.length; i++) {
        expect(matches[i - 1].score).toBeGreaterThanOrEqual(matches[i].score);
      }
    });
  });

  describe('findBestMatch', () => {
    it('returns best matching item', () => {
      const result = findBestMatch(mockItems, 'PDF extraction');
      expect(result).not.toBeNull();
      expect(result?.title).toContain('PDF');
    });

    it('returns null when no match meets threshold', () => {
      const result = findBestMatch(mockItems, 'completely unrelated xyz', 0.9);
      expect(result).toBeNull();
    });
  });

  describe('getSuggestions', () => {
    it('returns suggestions for partial matches', () => {
      const suggestions = getSuggestions(mockItems, 'API');
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.length).toBeLessThanOrEqual(3);
    });

    it('formats suggestions with number and title', () => {
      const suggestions = getSuggestions(mockItems, 'doc');
      suggestions.forEach(suggestion => {
        expect(suggestion).toMatch(/^#\d+:/);
      });
    });
  });
});

describe('StatusUpdater', () => {
  let updater: StatusUpdater;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up default mock implementations
    mockGetProject.mockResolvedValue(mockProjectContext);
    mockGetProjectItems.mockResolvedValue(mockItems);
    mockUpdateItemStatus.mockResolvedValue(undefined);

    updater = createStatusUpdater('test-token');
  });

  describe('createStatusUpdater', () => {
    it('creates an updater with valid token', () => {
      const service = createStatusUpdater('test-token');
      expect(service).toBeInstanceOf(StatusUpdater);
    });

    it('throws on missing token', () => {
      expect(() => createStatusUpdater('')).toThrow(GitHubClientError);
    });
  });

  describe('parseRequest', () => {
    it('parses "move X to Y" pattern', () => {
      const result = updater.parseRequest('move API docs to done');
      expect(result.query).toBe('api docs');
      expect(result.targetStatus).toBe('done');
      expect(result.isBlocked).toBe(false);
    });

    it('parses "set X as Y" pattern', () => {
      const result = updater.parseRequest('set PDF extraction as in progress');
      expect(result.query).toBe('pdf extraction');
      expect(result.targetStatus).toBe('in progress');
    });

    it('parses "mark X as Y" pattern', () => {
      const result = updater.parseRequest('mark #12 as done');
      expect(result.query).toBe('#12');
      expect(result.targetStatus).toBe('done');
    });

    it('parses blocked status with reason', () => {
      const result = updater.parseRequest('set PDF extraction as blocked - waiting on design review');
      expect(result.query).toBe('pdf extraction');
      expect(result.targetStatus).toBe('blocked');
      expect(result.blockedReason).toBe('waiting on design review');
      expect(result.isBlocked).toBe(true);
    });

    it('parses blocked status with colon separator', () => {
      const result = updater.parseRequest('move API endpoint to blocked: needs API key');
      expect(result.query).toBe('api endpoint');
      expect(result.blockedReason).toBe('needs api key');
      expect(result.isBlocked).toBe(true);
    });

    it('parses simple status pattern', () => {
      const result = updater.parseRequest('API docs done');
      expect(result.query).toBe('api docs');
      expect(result.targetStatus).toBe('done');
    });

    it('throws on unparseable input', () => {
      expect(() => updater.parseRequest('invalid request')).toThrow('Could not parse');
    });
  });

  describe('updateStatus', () => {
    it('updates status for exact match', async () => {
      const result = await updater.updateStatus(
        { query: '#12', targetStatus: 'done', isBlocked: false },
        { org: 'test-org', projectNumber: 1 }
      );

      expect(result.success).toBe(true);
      expect(result.number).toBe(12);
      expect(result.newStatus).toBe('done');
      expect(mockUpdateItemStatus).toHaveBeenCalledWith(
        'mock-project-id',
        'item-4',
        'mock-status-field-id',
        'option-done'
      );
    });

    it('updates status with fuzzy title match', async () => {
      const result = await updater.updateStatus(
        { query: 'PDF extraction', targetStatus: 'done', isBlocked: false },
        { org: 'test-org', projectNumber: 1 }
      );

      expect(result.success).toBe(true);
      expect(result.title).toContain('PDF');
      expect(result.matchScore).toBeGreaterThan(0.5);
    });

    it('resolves status aliases', async () => {
      const result = await updater.updateStatus(
        { query: '#12', targetStatus: 'complete', isBlocked: false },
        { org: 'test-org', projectNumber: 1 }
      );

      expect(result.newStatus).toBe('done');
    });

    it('resolves "wip" alias to in progress', async () => {
      const result = await updater.updateStatus(
        { query: '#12', targetStatus: 'wip', isBlocked: false },
        { org: 'test-org', projectNumber: 1 }
      );

      expect(result.newStatus).toBe('in progress');
    });

    it('throws ItemNotFoundError when no match found', async () => {
      await expect(
        updater.updateStatus(
          { query: 'nonexistent task xyz123', targetStatus: 'done', isBlocked: false },
          { org: 'test-org', projectNumber: 1 }
        )
      ).rejects.toThrow(ItemNotFoundError);
    });

    it('throws InvalidStatusError for unknown status', async () => {
      await expect(
        updater.updateStatus(
          { query: '#12', targetStatus: 'invalid-status-xyz', isBlocked: false },
          { org: 'test-org', projectNumber: 1 }
        )
      ).rejects.toThrow(InvalidStatusError);
    });

    it('includes blocked reason in result message', async () => {
      const result = await updater.updateStatus(
        {
          query: '#12',
          targetStatus: 'blocked',
          isBlocked: true,
          blockedReason: 'waiting on design review',
        },
        { org: 'test-org', projectNumber: 1 }
      );

      expect(result.message).toBe('Blocked: waiting on design review');
    });

    it('tracks previous status in result', async () => {
      const result = await updater.updateStatus(
        { query: '#12', targetStatus: 'in progress', isBlocked: false },
        { org: 'test-org', projectNumber: 1 }
      );

      expect(result.previousStatus).toBe('Done');
    });
  });

  describe('processUpdate', () => {
    it('parses and executes update in one call', async () => {
      const result = await updater.processUpdate(
        'move API documentation to done',
        { org: 'test-org', projectNumber: 1 }
      );

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('done');
    });

    it('handles complex blocked request', async () => {
      const result = await updater.processUpdate(
        'set PDF extraction as blocked - waiting on design',
        { org: 'test-org', projectNumber: 1 }
      );

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('blocked');
      expect(result.message).toContain('waiting on design');
    });
  });

  describe('custom status aliases', () => {
    it('adds custom alias', async () => {
      updater.addStatusAlias('ready', 'done');

      const result = await updater.updateStatus(
        { query: '#12', targetStatus: 'ready', isBlocked: false },
        { org: 'test-org', projectNumber: 1 }
      );

      expect(result.newStatus).toBe('done');
    });

    it('removes custom alias', () => {
      updater.addStatusAlias('custom', 'done');
      const removed = updater.removeStatusAlias('custom');
      expect(removed).toBe(true);
    });

    it('returns false when removing non-existent alias', () => {
      const removed = updater.removeStatusAlias('nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('cache management', () => {
    it('clears cache', () => {
      updater.clearCache();
      expect(mockClearCache).toHaveBeenCalled();
    });

    it('provides access to GitHub client', () => {
      const client = updater.getGitHubClient();
      expect(client).toBeDefined();
    });
  });
});

describe('Error classes', () => {
  describe('ItemNotFoundError', () => {
    it('creates error with query', () => {
      const error = new ItemNotFoundError('test query');
      expect(error.message).toContain('test query');
      expect(error.name).toBe('ItemNotFoundError');
    });

    it('includes suggestions when provided', () => {
      const error = new ItemNotFoundError('test', ['#1: Suggestion 1', '#2: Suggestion 2']);
      expect(error.message).toContain('Did you mean');
      expect(error.suggestions).toHaveLength(2);
    });
  });

  describe('AmbiguousMatchError', () => {
    it('creates error with matches', () => {
      const matches = [
        { title: 'Match 1', number: 1, score: 0.8 },
        { title: 'Match 2', number: 2, score: 0.75 },
      ];
      const error = new AmbiguousMatchError('query', matches);
      expect(error.message).toContain('Multiple items match');
      expect(error.matches).toHaveLength(2);
    });
  });

  describe('InvalidStatusError', () => {
    it('creates error with available statuses', () => {
      const error = new InvalidStatusError('invalid', ['todo', 'done']);
      expect(error.message).toContain('invalid');
      expect(error.message).toContain('todo, done');
      expect(error.availableStatuses).toEqual(['todo', 'done']);
    });
  });
});

describe('Integration scenarios', () => {
  let updater: StatusUpdater;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProject.mockResolvedValue(mockProjectContext);
    mockGetProjectItems.mockResolvedValue(mockItems);
    mockUpdateItemStatus.mockResolvedValue(undefined);
    updater = createStatusUpdater('test-token');
  });

  it('handles "move API documentation to done" scenario', async () => {
    const result = await updater.processUpdate(
      'move API documentation to done',
      { org: 'test-org', projectNumber: 1 }
    );

    expect(result.success).toBe(true);
    expect(result.newStatus).toBe('done');
    // Should match "Implement API documentation" (higher specificity)
    expect(result.title).toBe('Implement API documentation');
  });

  it('handles "set PDF extraction as blocked - waiting on design review"', async () => {
    const result = await updater.processUpdate(
      'set PDF extraction as blocked - waiting on design review',
      { org: 'test-org', projectNumber: 1 }
    );

    expect(result.success).toBe(true);
    expect(result.newStatus).toBe('blocked');
    expect(result.message).toBe('Blocked: waiting on design review');
  });

  it('handles "mark #12 as in progress"', async () => {
    const result = await updater.processUpdate(
      'mark #12 as in progress',
      { org: 'test-org', projectNumber: 1 }
    );

    expect(result.success).toBe(true);
    expect(result.number).toBe(12);
    expect(result.newStatus).toBe('in progress');
  });

  it('handles user project (non-org)', async () => {
    const result = await updater.processUpdate(
      'move database schema to done',
      { org: 'testuser', projectNumber: 1, isOrg: false }
    );

    expect(result.success).toBe(true);
    expect(mockGetProject).toHaveBeenCalledWith('testuser', 1, false);
  });

  it('throws AmbiguousMatchError when query matches multiple items equally', async () => {
    // "API docs" matches both "Implement API documentation" and "Document API endpoints"
    await expect(
      updater.processUpdate(
        'move API docs to done',
        { org: 'test-org', projectNumber: 1 }
      )
    ).rejects.toThrow(AmbiguousMatchError);
  });
});
