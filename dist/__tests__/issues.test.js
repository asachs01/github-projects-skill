import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubClientError } from '../github/client.js';
// Mock fetch for REST API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;
// Create mock functions for GitHubClient methods
const mockAddItemToProject = vi.fn();
const mockGetProject = vi.fn();
const mockUpdateItemStatus = vi.fn();
// Mock the GitHubClient class
vi.mock('../github/client.js', async () => {
    const actual = await vi.importActual('../github/client.js');
    return {
        ...actual,
        GitHubClient: class MockGitHubClient {
            constructor() {
                // Constructor does nothing in mock
            }
            addItemToProject = mockAddItemToProject;
            getProject = mockGetProject;
            updateItemStatus = mockUpdateItemStatus;
        },
    };
});
// Import after mocking
import { createIssueService, IssueService } from '../issues/service.js';
describe('IssueService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Set up default mock implementations
        mockAddItemToProject.mockResolvedValue('mock-item-id');
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
        mockUpdateItemStatus.mockResolvedValue(undefined);
    });
    describe('createIssueService', () => {
        it('creates a service with valid token', () => {
            const service = createIssueService('test-token');
            expect(service).toBeInstanceOf(IssueService);
        });
        it('throws on missing token', () => {
            expect(() => createIssueService('')).toThrow('GitHub token is required');
        });
    });
    describe('createIssue', () => {
        it('creates an issue with basic fields', async () => {
            const mockResponse = {
                id: 12345,
                node_id: 'I_kwDOABCDEF',
                number: 42,
                title: 'Test Issue',
                body: 'This is a test issue',
                state: 'open',
                html_url: 'https://github.com/owner/repo/issues/42',
                url: 'https://api.github.com/repos/owner/repo/issues/42',
                labels: [{ id: 1, name: 'bug', color: 'ff0000', description: 'Bug label' }],
                assignees: [{ id: 1, login: 'testuser', avatar_url: 'https://example.com/avatar.png' }],
                milestone: null,
                created_at: '2024-01-01T00:00:00Z',
                updated_at: '2024-01-01T00:00:00Z',
                closed_at: null,
            };
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });
            const service = createIssueService('test-token');
            const issue = await service.createIssue({
                owner: 'owner',
                repo: 'repo',
                title: 'Test Issue',
                body: 'This is a test issue',
                labels: ['bug'],
                assignees: ['testuser'],
            });
            expect(issue.id).toBe(12345);
            expect(issue.nodeId).toBe('I_kwDOABCDEF');
            expect(issue.number).toBe(42);
            expect(issue.title).toBe('Test Issue');
            expect(issue.body).toBe('This is a test issue');
            expect(issue.state).toBe('open');
            expect(issue.url).toBe('https://github.com/owner/repo/issues/42');
            expect(issue.labels).toEqual(['bug']);
            expect(issue.assignees).toEqual(['testuser']);
            expect(mockFetch).toHaveBeenCalledWith('https://api.github.com/repos/owner/repo/issues', expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Bearer test-token',
                }),
            }));
        });
        it('creates an issue with minimal fields', async () => {
            const mockResponse = {
                id: 12345,
                node_id: 'I_kwDOABCDEF',
                number: 42,
                title: 'Minimal Issue',
                body: null,
                state: 'open',
                html_url: 'https://github.com/owner/repo/issues/42',
                url: 'https://api.github.com/repos/owner/repo/issues/42',
                labels: [],
                assignees: [],
                milestone: null,
                created_at: '2024-01-01T00:00:00Z',
                updated_at: '2024-01-01T00:00:00Z',
                closed_at: null,
            };
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });
            const service = createIssueService('test-token');
            const issue = await service.createIssue({
                owner: 'owner',
                repo: 'repo',
                title: 'Minimal Issue',
            });
            expect(issue.title).toBe('Minimal Issue');
            expect(issue.body).toBeNull();
            expect(issue.labels).toEqual([]);
            expect(issue.assignees).toEqual([]);
        });
        it('throws on authentication failure (401)', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
                text: () => Promise.resolve('Bad credentials'),
            });
            const service = createIssueService('invalid-token');
            await expect(service.createIssue({
                owner: 'owner',
                repo: 'repo',
                title: 'Test',
            })).rejects.toThrow('Authentication failed');
        });
        it('throws on access denied (403)', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 403,
                statusText: 'Forbidden',
                text: () => Promise.resolve('Permission denied'),
            });
            const service = createIssueService('limited-token');
            await expect(service.createIssue({
                owner: 'owner',
                repo: 'repo',
                title: 'Test',
            })).rejects.toThrow('Access denied');
        });
        it('throws on repository not found (404)', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
                text: () => Promise.resolve('Not Found'),
            });
            const service = createIssueService('test-token');
            await expect(service.createIssue({
                owner: 'nonexistent',
                repo: 'repo',
                title: 'Test',
            })).rejects.toThrow('Repository nonexistent/repo not found');
        });
        it('throws on validation error (422)', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 422,
                statusText: 'Unprocessable Entity',
                text: () => Promise.resolve('Validation failed'),
            });
            const service = createIssueService('test-token');
            await expect(service.createIssue({
                owner: 'owner',
                repo: 'repo',
                title: '',
            })).rejects.toThrow('Invalid issue data');
        });
    });
    describe('addIssueToProject', () => {
        it('adds an issue to a project', async () => {
            const service = createIssueService('test-token');
            const result = await service.addIssueToProject('project-id', 'issue-node-id');
            expect(result.itemId).toBe('mock-item-id');
            expect(result.issueNodeId).toBe('issue-node-id');
            expect(mockAddItemToProject).toHaveBeenCalledWith('project-id', 'issue-node-id');
        });
    });
    describe('setIssueStatus', () => {
        it('sets issue status in a project', async () => {
            const service = createIssueService('test-token');
            const result = await service.setIssueStatus('project-id', 'item-id', 'In Progress', 'test-org', 1, true);
            expect(result.itemId).toBe('item-id');
            expect(result.status).toBe('In Progress');
            expect(mockGetProject).toHaveBeenCalledWith('test-org', 1, true);
            expect(mockUpdateItemStatus).toHaveBeenCalledWith('project-id', 'item-id', 'mock-status-field-id', 'option-in-progress-id');
        });
        it('handles case-insensitive status lookup', async () => {
            const service = createIssueService('test-token');
            const result = await service.setIssueStatus('project-id', 'item-id', 'TODO', 'test-org', 1, true);
            expect(result.status).toBe('TODO');
            expect(mockUpdateItemStatus).toHaveBeenCalledWith('project-id', 'item-id', 'mock-status-field-id', 'option-todo-id');
        });
        it('throws when status not found', async () => {
            const service = createIssueService('test-token');
            await expect(service.setIssueStatus('project-id', 'item-id', 'Invalid Status', 'test-org', 1, true)).rejects.toThrow('Status "Invalid Status" not found in project');
        });
    });
    describe('createIssueInProject', () => {
        it('creates issue and adds to project in one operation', async () => {
            const mockResponse = {
                id: 12345,
                node_id: 'I_kwDOABCDEF',
                number: 42,
                title: 'Test Issue',
                body: 'Test body',
                state: 'open',
                html_url: 'https://github.com/owner/repo/issues/42',
                url: 'https://api.github.com/repos/owner/repo/issues/42',
                labels: [],
                assignees: [],
                milestone: null,
                created_at: '2024-01-01T00:00:00Z',
                updated_at: '2024-01-01T00:00:00Z',
                closed_at: null,
            };
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });
            const service = createIssueService('test-token');
            const result = await service.createIssueInProject({
                owner: 'owner',
                repo: 'repo',
                title: 'Test Issue',
                body: 'Test body',
            }, 'project-id', 'Todo', 'test-org', 1, true);
            expect(result.issue.title).toBe('Test Issue');
            expect(result.projectItemId).toBe('mock-item-id');
            expect(mockAddItemToProject).toHaveBeenCalledWith('project-id', 'I_kwDOABCDEF');
        });
        it('creates issue and adds to project without initial status', async () => {
            const mockResponse = {
                id: 12345,
                node_id: 'I_kwDOABCDEF',
                number: 42,
                title: 'No Status Issue',
                body: null,
                state: 'open',
                html_url: 'https://github.com/owner/repo/issues/42',
                url: 'https://api.github.com/repos/owner/repo/issues/42',
                labels: [],
                assignees: [],
                milestone: null,
                created_at: '2024-01-01T00:00:00Z',
                updated_at: '2024-01-01T00:00:00Z',
                closed_at: null,
            };
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });
            const service = createIssueService('test-token');
            const result = await service.createIssueInProject({
                owner: 'owner',
                repo: 'repo',
                title: 'No Status Issue',
            }, 'project-id');
            expect(result.issue.title).toBe('No Status Issue');
            expect(result.projectItemId).toBe('mock-item-id');
            // setIssueStatus should not be called when no initialStatus provided
            expect(mockUpdateItemStatus).not.toHaveBeenCalled();
        });
    });
    describe('getGitHubClient', () => {
        it('returns the underlying GitHub client', () => {
            const service = createIssueService('test-token');
            const client = service.getGitHubClient();
            expect(client).toBeDefined();
        });
    });
});
describe('GitHubClientError usage in IssueService', () => {
    it('uses GitHubClientError for token validation', () => {
        expect(() => createIssueService('')).toThrow(GitHubClientError);
    });
});
//# sourceMappingURL=issues.test.js.map