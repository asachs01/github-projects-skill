import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubClientError } from '../github/client.js';

// Mock fetch for REST API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Create mock functions for GitHubClient methods
const mockGetProject = vi.fn();
const mockGetProjectItems = vi.fn();

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
    },
  };
});

// Import after mocking
import { createCommentService, CommentService } from '../comments/service.js';
import { IssueNotFoundError, AmbiguousIssueMatchError } from '../comments/types.js';

// Helper to create mock project items
function createMockProjectItem(number: number, title: string, state: 'OPEN' | 'CLOSED' = 'OPEN') {
  return {
    id: `item-${number}`,
    fieldValues: { nodes: [] },
    content: {
      id: `issue-${number}`,
      number,
      title,
      url: `https://github.com/owner/repo/issues/${number}`,
      state,
      labels: { nodes: [] },
      assignees: { nodes: [] },
      updatedAt: '2024-01-01T00:00:00Z',
      closedAt: null,
    },
  };
}

// Helper to create mock issues from REST API
function createMockRestIssue(number: number, title: string, state: string = 'open') {
  return {
    id: number * 1000,
    node_id: `issue-${number}`,
    number,
    title,
    state,
    html_url: `https://github.com/owner/repo/issues/${number}`,
    labels: [],
    assignees: [],
    updated_at: '2024-01-01T00:00:00Z',
    closed_at: null,
  };
}

describe('CommentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set up default mock implementations
    mockGetProject.mockResolvedValue({
      projectId: 'mock-project-id',
      projectNumber: 1,
      statusFieldId: 'mock-status-field-id',
      statusOptions: new Map([
        ['todo', 'option-todo-id'],
        ['in progress', 'option-in-progress-id'],
        ['done', 'option-done-id'],
      ]),
      cachedAt: Date.now(),
    });

    mockGetProjectItems.mockResolvedValue([
      createMockProjectItem(1, 'PDF extraction feature'),
      createMockProjectItem(2, 'Authentication system'),
      createMockProjectItem(3, 'API documentation'),
      createMockProjectItem(4, 'Bug fix for login'),
    ]);
  });

  describe('createCommentService', () => {
    it('creates a service with valid token', () => {
      const service = createCommentService('test-token');
      expect(service).toBeInstanceOf(CommentService);
    });

    it('throws on missing token', () => {
      expect(() => createCommentService('')).toThrow('GitHub token is required');
    });

    it('accepts custom minMatchScore option', () => {
      const service = createCommentService('test-token', { minMatchScore: 0.5 });
      expect(service).toBeInstanceOf(CommentService);
    });
  });

  describe('addComment', () => {
    it('adds a comment to an issue', async () => {
      const mockResponse = {
        id: 12345,
        node_id: 'IC_kwDOABCDEF',
        url: 'https://api.github.com/repos/owner/repo/issues/comments/12345',
        html_url: 'https://github.com/owner/repo/issues/1#issuecomment-12345',
        body: 'Started working on this today',
        user: {
          id: 1,
          login: 'testuser',
          avatar_url: 'https://example.com/avatar.png',
        },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        issue_url: 'https://api.github.com/repos/owner/repo/issues/1',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const service = createCommentService('test-token');
      const comment = await service.addComment({
        owner: 'owner',
        repo: 'repo',
        issueNumber: 1,
        body: 'Started working on this today',
      });

      expect(comment.id).toBe(12345);
      expect(comment.nodeId).toBe('IC_kwDOABCDEF');
      expect(comment.body).toBe('Started working on this today');
      expect(comment.author).toBe('testuser');
      expect(comment.url).toBe('https://github.com/owner/repo/issues/1#issuecomment-12345');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/issues/1/comments',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
          body: JSON.stringify({ body: 'Started working on this today' }),
        })
      );
    });

    it('throws on authentication failure (401)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Bad credentials'),
      });

      const service = createCommentService('invalid-token');

      await expect(
        service.addComment({
          owner: 'owner',
          repo: 'repo',
          issueNumber: 1,
          body: 'Test comment',
        })
      ).rejects.toThrow('Authentication failed');
    });

    it('throws on access denied (403)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: () => Promise.resolve('Permission denied'),
      });

      const service = createCommentService('limited-token');

      await expect(
        service.addComment({
          owner: 'owner',
          repo: 'repo',
          issueNumber: 1,
          body: 'Test comment',
        })
      ).rejects.toThrow('Access denied');
    });

    it('throws on issue not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('Not Found'),
      });

      const service = createCommentService('test-token');

      await expect(
        service.addComment({
          owner: 'owner',
          repo: 'repo',
          issueNumber: 999,
          body: 'Test comment',
        })
      ).rejects.toThrow('Issue #999 not found');
    });

    it('throws on validation error (422)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        text: () => Promise.resolve('Validation failed'),
      });

      const service = createCommentService('test-token');

      await expect(
        service.addComment({
          owner: 'owner',
          repo: 'repo',
          issueNumber: 1,
          body: '',
        })
      ).rejects.toThrow('Invalid comment data');
    });
  });

  describe('addNote', () => {
    it('adds a note to an issue found by fuzzy matching', async () => {
      // Mock getRepoIssues
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          createMockRestIssue(1, 'PDF extraction feature'),
          createMockRestIssue(2, 'Authentication system'),
          createMockRestIssue(3, 'API documentation'),
        ]),
      });

      // Mock addComment
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 12345,
          node_id: 'IC_kwDOABCDEF',
          url: 'https://api.github.com/repos/owner/repo/issues/comments/12345',
          html_url: 'https://github.com/owner/repo/issues/1#issuecomment-12345',
          body: 'Started on this today',
          user: { id: 1, login: 'testuser', avatar_url: 'https://example.com/avatar.png' },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          issue_url: 'https://api.github.com/repos/owner/repo/issues/1',
        }),
      });

      const service = createCommentService('test-token');
      const result = await service.addNote({
        owner: 'owner',
        repo: 'repo',
        query: 'PDF extraction',
        note: 'Started on this today',
      });

      expect(result.success).toBe(true);
      expect(result.issueNumber).toBe(1);
      expect(result.issueTitle).toBe('PDF extraction feature');
      expect(result.comment.body).toBe('Started on this today');
      expect(result.matchScore).toBeGreaterThan(0.5);
    });

    it('adds a note to an issue found by number', async () => {
      // Mock getRepoIssues
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          createMockRestIssue(12, 'Some issue'),
          createMockRestIssue(13, 'Another issue'),
        ]),
      });

      // Mock addComment
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 12345,
          node_id: 'IC_kwDOABCDEF',
          url: 'https://api.github.com/repos/owner/repo/issues/comments/12345',
          html_url: 'https://github.com/owner/repo/issues/12#issuecomment-12345',
          body: 'Needs review',
          user: { id: 1, login: 'testuser', avatar_url: 'https://example.com/avatar.png' },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          issue_url: 'https://api.github.com/repos/owner/repo/issues/12',
        }),
      });

      const service = createCommentService('test-token');
      const result = await service.addNote({
        owner: 'owner',
        repo: 'repo',
        query: '#12',
        note: 'Needs review',
      });

      expect(result.success).toBe(true);
      expect(result.issueNumber).toBe(12);
      expect(result.matchScore).toBe(1.0);
    });

    it('throws IssueNotFoundError when no match found', async () => {
      // Mock getRepoIssues
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          createMockRestIssue(1, 'PDF extraction feature'),
          createMockRestIssue(2, 'Authentication system'),
        ]),
      });

      const service = createCommentService('test-token');

      await expect(
        service.addNote({
          owner: 'owner',
          repo: 'repo',
          query: 'nonexistent feature',
          note: 'Some note',
        })
      ).rejects.toThrow(IssueNotFoundError);
    });

    it('throws AmbiguousIssueMatchError when multiple close matches', async () => {
      // Mock getRepoIssues with titles where the query is in the middle (not a prefix)
      // This ensures scores are below 0.9 (prefix match gives 0.95)
      // Using same-length titles for identical scores
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          createMockRestIssue(1, 'Implement auth login'),
          createMockRestIssue(2, 'Implement auth reset'),
          createMockRestIssue(3, 'Implement auth check'),
        ]),
      });

      const service = createCommentService('test-token');

      // "auth" is a substring in the middle, scores will be below 0.9 and identical
      await expect(
        service.addNote({
          owner: 'owner',
          repo: 'repo',
          query: 'auth',
          note: 'Some note',
        })
      ).rejects.toThrow(AmbiguousIssueMatchError);
    });
  });

  describe('addNoteToProjectItem', () => {
    it('adds a note to a project item found by fuzzy matching', async () => {
      // Mock addComment
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 12345,
          node_id: 'IC_kwDOABCDEF',
          url: 'https://api.github.com/repos/owner/repo/issues/comments/12345',
          html_url: 'https://github.com/owner/repo/issues/1#issuecomment-12345',
          body: 'Progress update',
          user: { id: 1, login: 'testuser', avatar_url: 'https://example.com/avatar.png' },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          issue_url: 'https://api.github.com/repos/owner/repo/issues/1',
        }),
      });

      const service = createCommentService('test-token');
      const result = await service.addNoteToProjectItem(
        'test-org',
        1,
        'PDF',
        'Progress update',
        'owner',
        'repo',
        true
      );

      expect(result.success).toBe(true);
      expect(result.issueNumber).toBe(1);
      expect(result.issueTitle).toBe('PDF extraction feature');
      expect(mockGetProject).toHaveBeenCalledWith('test-org', 1, true);
      expect(mockGetProjectItems).toHaveBeenCalled();
    });

    it('throws when project item not found', async () => {
      mockGetProjectItems.mockResolvedValue([
        createMockProjectItem(1, 'PDF extraction feature'),
      ]);

      const service = createCommentService('test-token');

      await expect(
        service.addNoteToProjectItem(
          'test-org',
          1,
          'nonexistent',
          'Some note',
          'owner',
          'repo',
          true
        )
      ).rejects.toThrow(IssueNotFoundError);
    });
  });

  describe('parseNoteRequest', () => {
    it('parses "add note to [query]: [note]" format', () => {
      const service = createCommentService('test-token');

      const result = service.parseNoteRequest('add note to PDF extraction: Started on this today');
      expect(result).toEqual({
        query: 'PDF extraction',
        note: 'Started on this today',
      });
    });

    it('parses "note to [query]: [note]" format', () => {
      const service = createCommentService('test-token');

      const result = service.parseNoteRequest('note to API docs: Need to update examples');
      expect(result).toEqual({
        query: 'API docs',
        note: 'Need to update examples',
      });
    });

    it('parses "comment on [query]: [note]" format', () => {
      const service = createCommentService('test-token');

      const result = service.parseNoteRequest('comment on #12: Needs design review first');
      expect(result).toEqual({
        query: '#12',
        note: 'Needs design review first',
      });
    });

    it('parses "reply to [query]: [note]" format', () => {
      const service = createCommentService('test-token');

      const result = service.parseNoteRequest('reply to authentication: waiting for design team');
      expect(result).toEqual({
        query: 'authentication',
        note: 'waiting for design team',
      });
    });

    it('parses simple "[query]: [note]" format', () => {
      const service = createCommentService('test-token');

      const result = service.parseNoteRequest('PDF extraction: almost done with this');
      expect(result).toEqual({
        query: 'PDF extraction',
        note: 'almost done with this',
      });
    });

    it('returns null for invalid format', () => {
      const service = createCommentService('test-token');

      expect(service.parseNoteRequest('invalid input without colon')).toBeNull();
      expect(service.parseNoteRequest('')).toBeNull();
      expect(service.parseNoteRequest(':')).toBeNull();
      expect(service.parseNoteRequest('query:')).toBeNull();
    });

    it('handles multi-word notes with colons', () => {
      const service = createCommentService('test-token');

      const result = service.parseNoteRequest('add note to login: Status: in progress');
      expect(result).toEqual({
        query: 'login',
        note: 'Status: in progress',
      });
    });
  });

  describe('getGitHubClient', () => {
    it('returns the underlying GitHub client', () => {
      const service = createCommentService('test-token');
      const client = service.getGitHubClient();

      expect(client).toBeDefined();
    });
  });
});

describe('Error types', () => {
  describe('IssueNotFoundError', () => {
    it('creates error with suggestions', () => {
      const error = new IssueNotFoundError('test query', ['#1: First issue', '#2: Second issue']);
      expect(error.name).toBe('IssueNotFoundError');
      expect(error.query).toBe('test query');
      expect(error.suggestions).toEqual(['#1: First issue', '#2: Second issue']);
      expect(error.message).toContain('Did you mean');
    });

    it('creates error without suggestions', () => {
      const error = new IssueNotFoundError('test query');
      expect(error.message).toBe('No issue found matching "test query"');
      expect(error.suggestions).toBeUndefined();
    });
  });

  describe('AmbiguousIssueMatchError', () => {
    it('creates error with match details', () => {
      const matches = [
        { title: 'First', number: 1, score: 0.9 },
        { title: 'Second', number: 2, score: 0.85 },
      ];
      const error = new AmbiguousIssueMatchError('test', matches);
      expect(error.name).toBe('AmbiguousIssueMatchError');
      expect(error.query).toBe('test');
      expect(error.matches).toEqual(matches);
      expect(error.message).toContain('Multiple issues match');
      expect(error.message).toContain('#1: First');
      expect(error.message).toContain('#2: Second');
    });
  });
});

describe('GitHubClientError usage in CommentService', () => {
  it('uses GitHubClientError for token validation', () => {
    expect(() => createCommentService('')).toThrow(GitHubClientError);
  });
});
