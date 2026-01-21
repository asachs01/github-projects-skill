import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubClientError } from '../github/client.js';
// Mock fetch for REST API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;
// Mock the GitHubClient class
vi.mock('../github/client.js', async () => {
    const actual = await vi.importActual('../github/client.js');
    return {
        ...actual,
        GitHubClient: class MockGitHubClient {
            constructor() {
                // Constructor does nothing in mock
            }
        },
    };
});
// Import after mocking
import { createMilestoneService, MilestoneService } from '../milestones/service.js';
import { MilestoneNotFoundError } from '../milestones/types.js';
// Helper to create mock milestone response
function createMockMilestoneResponse(number, title, state = 'open', openIssues = 5, closedIssues = 3) {
    return {
        id: number * 1000,
        node_id: `milestone-${number}`,
        number,
        title,
        description: `Description for ${title}`,
        state,
        open_issues: openIssues,
        closed_issues: closedIssues,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        due_on: '2024-12-31T23:59:59Z',
        closed_at: state === 'closed' ? '2024-06-01T00:00:00Z' : null,
        html_url: `https://github.com/owner/repo/milestone/${number}`,
        url: `https://api.github.com/repos/owner/repo/milestones/${number}`,
        creator: {
            id: 1,
            login: 'testuser',
            avatar_url: 'https://example.com/avatar.png',
        },
    };
}
describe('MilestoneService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    describe('createMilestoneService', () => {
        it('creates a service with valid token', () => {
            const service = createMilestoneService('test-token');
            expect(service).toBeInstanceOf(MilestoneService);
        });
        it('throws on missing token', () => {
            expect(() => createMilestoneService('')).toThrow('GitHub token is required');
        });
    });
    describe('createMilestone', () => {
        it('creates a milestone with basic fields', async () => {
            const mockResponse = createMockMilestoneResponse(1, 'Sprint 1');
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });
            const service = createMilestoneService('test-token');
            const milestone = await service.createMilestone({
                owner: 'owner',
                repo: 'repo',
                title: 'Sprint 1',
                description: 'First sprint',
                dueOn: '2024-12-31T23:59:59Z',
            });
            expect(milestone.number).toBe(1);
            expect(milestone.title).toBe('Sprint 1');
            expect(milestone.description).toBe('Description for Sprint 1');
            expect(milestone.state).toBe('open');
            expect(milestone.dueOn).toBe('2024-12-31T23:59:59Z');
            expect(milestone.progress).toBe(38); // 3/(5+3) = 37.5% rounded to 38%
            expect(mockFetch).toHaveBeenCalledWith('https://api.github.com/repos/owner/repo/milestones', expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Bearer test-token',
                }),
            }));
        });
        it('creates a milestone with minimal fields', async () => {
            const mockResponse = createMockMilestoneResponse(2, 'Q1 2024');
            mockResponse.description = null;
            mockResponse.due_on = null;
            mockResponse.open_issues = 0;
            mockResponse.closed_issues = 0;
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });
            const service = createMilestoneService('test-token');
            const milestone = await service.createMilestone({
                owner: 'owner',
                repo: 'repo',
                title: 'Q1 2024',
            });
            expect(milestone.title).toBe('Q1 2024');
            expect(milestone.description).toBeNull();
            expect(milestone.dueOn).toBeNull();
            expect(milestone.progress).toBe(0);
        });
        it('throws on authentication failure (401)', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
                text: () => Promise.resolve('Bad credentials'),
            });
            const service = createMilestoneService('invalid-token');
            await expect(service.createMilestone({
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
            const service = createMilestoneService('limited-token');
            await expect(service.createMilestone({
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
            const service = createMilestoneService('test-token');
            await expect(service.createMilestone({
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
            const service = createMilestoneService('test-token');
            await expect(service.createMilestone({
                owner: 'owner',
                repo: 'repo',
                title: '',
            })).rejects.toThrow('Invalid milestone data');
        });
    });
    describe('updateMilestone', () => {
        it('updates a milestone', async () => {
            const mockResponse = createMockMilestoneResponse(1, 'Sprint 1 Updated', 'closed');
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });
            const service = createMilestoneService('test-token');
            const milestone = await service.updateMilestone({
                owner: 'owner',
                repo: 'repo',
                milestoneNumber: 1,
                title: 'Sprint 1 Updated',
                state: 'closed',
            });
            expect(milestone.title).toBe('Sprint 1 Updated');
            expect(milestone.state).toBe('closed');
            expect(mockFetch).toHaveBeenCalledWith('https://api.github.com/repos/owner/repo/milestones/1', expect.objectContaining({
                method: 'PATCH',
            }));
        });
        it('throws MilestoneNotFoundError on 404', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
                text: () => Promise.resolve('Not Found'),
            });
            const service = createMilestoneService('test-token');
            await expect(service.updateMilestone({
                owner: 'owner',
                repo: 'repo',
                milestoneNumber: 999,
                title: 'Updated',
            })).rejects.toThrow(MilestoneNotFoundError);
        });
    });
    describe('getMilestone', () => {
        it('gets a milestone by number', async () => {
            const mockResponse = createMockMilestoneResponse(1, 'Sprint 1');
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });
            const service = createMilestoneService('test-token');
            const milestone = await service.getMilestone('owner', 'repo', 1);
            expect(milestone.number).toBe(1);
            expect(milestone.title).toBe('Sprint 1');
        });
        it('throws MilestoneNotFoundError on 404', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
                text: () => Promise.resolve('Not Found'),
            });
            const service = createMilestoneService('test-token');
            await expect(service.getMilestone('owner', 'repo', 999)).rejects.toThrow(MilestoneNotFoundError);
        });
    });
    describe('listMilestones', () => {
        it('lists milestones with default options', async () => {
            const mockResponse = [
                createMockMilestoneResponse(1, 'Sprint 1'),
                createMockMilestoneResponse(2, 'Sprint 2'),
            ];
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });
            const service = createMilestoneService('test-token');
            const milestones = await service.listMilestones({
                owner: 'owner',
                repo: 'repo',
            });
            expect(milestones).toHaveLength(2);
            expect(milestones[0].title).toBe('Sprint 1');
            expect(milestones[1].title).toBe('Sprint 2');
            expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('state=open'), expect.any(Object));
        });
        it('lists milestones with custom state filter', async () => {
            const mockResponse = [createMockMilestoneResponse(1, 'Completed Sprint', 'closed')];
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });
            const service = createMilestoneService('test-token');
            const milestones = await service.listMilestones({
                owner: 'owner',
                repo: 'repo',
                state: 'closed',
            });
            expect(milestones).toHaveLength(1);
            expect(milestones[0].state).toBe('closed');
        });
        it('returns empty array when no milestones exist', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve([]),
            });
            const service = createMilestoneService('test-token');
            const milestones = await service.listMilestones({
                owner: 'owner',
                repo: 'repo',
            });
            expect(milestones).toHaveLength(0);
        });
    });
    describe('deleteMilestone', () => {
        it('deletes a milestone', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
            });
            const service = createMilestoneService('test-token');
            await service.deleteMilestone('owner', 'repo', 1);
            expect(mockFetch).toHaveBeenCalledWith('https://api.github.com/repos/owner/repo/milestones/1', expect.objectContaining({
                method: 'DELETE',
            }));
        });
        it('throws MilestoneNotFoundError on 404', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
                text: () => Promise.resolve('Not Found'),
            });
            const service = createMilestoneService('test-token');
            await expect(service.deleteMilestone('owner', 'repo', 999)).rejects.toThrow(MilestoneNotFoundError);
        });
    });
    describe('assignMilestoneToIssue', () => {
        it('assigns a milestone to an issue', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    milestone: { number: 1, title: 'Sprint 1' },
                }),
            });
            const service = createMilestoneService('test-token');
            const result = await service.assignMilestoneToIssue({
                owner: 'owner',
                repo: 'repo',
                issueNumber: 42,
                milestoneNumber: 1,
            });
            expect(result.issueNumber).toBe(42);
            expect(result.milestoneNumber).toBe(1);
            expect(result.milestoneTitle).toBe('Sprint 1');
            expect(mockFetch).toHaveBeenCalledWith('https://api.github.com/repos/owner/repo/issues/42', expect.objectContaining({
                method: 'PATCH',
                body: JSON.stringify({ milestone: 1 }),
            }));
        });
        it('removes milestone from issue when null', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    milestone: null,
                }),
            });
            const service = createMilestoneService('test-token');
            const result = await service.assignMilestoneToIssue({
                owner: 'owner',
                repo: 'repo',
                issueNumber: 42,
                milestoneNumber: null,
            });
            expect(result.milestoneNumber).toBeNull();
            expect(result.milestoneTitle).toBeNull();
        });
        it('throws on issue not found (404)', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
                text: () => Promise.resolve('Not Found'),
            });
            const service = createMilestoneService('test-token');
            await expect(service.assignMilestoneToIssue({
                owner: 'owner',
                repo: 'repo',
                issueNumber: 999,
                milestoneNumber: 1,
            })).rejects.toThrow('Issue #999 not found');
        });
    });
    describe('findMilestoneByTitle', () => {
        it('finds milestone by exact title match', async () => {
            const mockResponse = [
                createMockMilestoneResponse(1, 'Sprint 1'),
                createMockMilestoneResponse(2, 'Sprint 2'),
            ];
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });
            const service = createMilestoneService('test-token');
            const milestone = await service.findMilestoneByTitle('owner', 'repo', 'Sprint 1');
            expect(milestone).not.toBeNull();
            expect(milestone.title).toBe('Sprint 1');
        });
        it('finds milestone by partial title match', async () => {
            const mockResponse = [
                createMockMilestoneResponse(1, 'Q1 2024 Sprint'),
                createMockMilestoneResponse(2, 'Q2 2024 Sprint'),
            ];
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });
            const service = createMilestoneService('test-token');
            const milestone = await service.findMilestoneByTitle('owner', 'repo', 'Q1');
            expect(milestone).not.toBeNull();
            expect(milestone.title).toBe('Q1 2024 Sprint');
        });
        it('returns null when no match found', async () => {
            const mockResponse = [createMockMilestoneResponse(1, 'Sprint 1')];
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });
            const service = createMilestoneService('test-token');
            const milestone = await service.findMilestoneByTitle('owner', 'repo', 'Nonexistent');
            expect(milestone).toBeNull();
        });
    });
    describe('parseMilestoneRequest', () => {
        it('parses "create milestone [name]" format', () => {
            const service = createMilestoneService('test-token');
            const result = service.parseMilestoneRequest('create milestone Sprint 1');
            expect(result).toEqual({
                action: 'create',
                title: 'Sprint 1',
            });
        });
        it('parses "create milestone [name] due [date]" format', () => {
            const service = createMilestoneService('test-token');
            const result = service.parseMilestoneRequest('create milestone Sprint 1 due next Friday');
            expect(result).toEqual({
                action: 'create',
                title: 'Sprint 1',
                dueDate: 'next Friday',
            });
        });
        it('parses "create milestone [name] for [project]" format', () => {
            const service = createMilestoneService('test-token');
            const result = service.parseMilestoneRequest('create milestone Q1 2024 for my-project');
            expect(result).toEqual({
                action: 'create',
                title: 'Q1 2024',
                project: 'my-project',
            });
        });
        it('parses "list milestones" format', () => {
            const service = createMilestoneService('test-token');
            const result = service.parseMilestoneRequest('list milestones');
            expect(result).toEqual({
                action: 'list',
            });
        });
        it('parses "list milestones for [project]" format', () => {
            const service = createMilestoneService('test-token');
            const result = service.parseMilestoneRequest('list milestones for my-project');
            expect(result).toEqual({
                action: 'list',
                project: 'my-project',
            });
        });
        it('parses "show milestones" format', () => {
            const service = createMilestoneService('test-token');
            const result = service.parseMilestoneRequest('show milestones');
            expect(result).toEqual({
                action: 'list',
            });
        });
        it('returns null for invalid format', () => {
            const service = createMilestoneService('test-token');
            expect(service.parseMilestoneRequest('invalid input')).toBeNull();
            expect(service.parseMilestoneRequest('')).toBeNull();
        });
    });
    describe('parseDueDate', () => {
        it('parses "next [day]" format', () => {
            const service = createMilestoneService('test-token');
            const result = service.parseDueDate('next Friday');
            expect(result).not.toBeNull();
            const date = new Date(result);
            expect(date.getDay()).toBe(5); // Friday
        });
        it('parses "in X days" format', () => {
            const service = createMilestoneService('test-token');
            const result = service.parseDueDate('in 7 days');
            expect(result).not.toBeNull();
            const date = new Date(result);
            const expected = new Date();
            expected.setDate(expected.getDate() + 7);
            expect(date.toDateString()).toBe(expected.toDateString());
        });
        it('parses "in X weeks" format', () => {
            const service = createMilestoneService('test-token');
            const result = service.parseDueDate('in 2 weeks');
            expect(result).not.toBeNull();
            const date = new Date(result);
            const expected = new Date();
            expected.setDate(expected.getDate() + 14);
            expect(date.toDateString()).toBe(expected.toDateString());
        });
        it('parses "tomorrow" format', () => {
            const service = createMilestoneService('test-token');
            const result = service.parseDueDate('tomorrow');
            expect(result).not.toBeNull();
            const date = new Date(result);
            const expected = new Date();
            expected.setDate(expected.getDate() + 1);
            expect(date.toDateString()).toBe(expected.toDateString());
        });
        it('parses "end of month" format', () => {
            const service = createMilestoneService('test-token');
            const result = service.parseDueDate('end of month');
            expect(result).not.toBeNull();
            const date = new Date(result);
            const now = new Date();
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            expect(date.getDate()).toBe(lastDay.getDate());
        });
        it('parses ISO date format', () => {
            const service = createMilestoneService('test-token');
            const result = service.parseDueDate('2024-12-31T12:00:00');
            expect(result).not.toBeNull();
            // Verify it returns a valid ISO string
            expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
            // Parse and check the year at minimum (timezone-safe)
            const date = new Date(result);
            expect(date.getFullYear()).toBe(2024);
        });
        it('returns null for invalid date format', () => {
            const service = createMilestoneService('test-token');
            expect(service.parseDueDate('invalid')).toBeNull();
            expect(service.parseDueDate('not a date')).toBeNull();
        });
    });
});
describe('MilestoneNotFoundError', () => {
    it('creates error with number identifier', () => {
        const error = new MilestoneNotFoundError(5);
        expect(error.name).toBe('MilestoneNotFoundError');
        expect(error.identifier).toBe(5);
        expect(error.message).toBe('Milestone "5" not found');
    });
    it('creates error with string identifier', () => {
        const error = new MilestoneNotFoundError('Sprint 1');
        expect(error.identifier).toBe('Sprint 1');
        expect(error.message).toBe('Milestone "Sprint 1" not found');
    });
    it('creates error with suggestions', () => {
        const error = new MilestoneNotFoundError('Spint 1', ['Sprint 1', 'Sprint 2']);
        expect(error.suggestions).toEqual(['Sprint 1', 'Sprint 2']);
        expect(error.message).toContain('Did you mean');
    });
});
describe('GitHubClientError usage in MilestoneService', () => {
    it('uses GitHubClientError for token validation', () => {
        expect(() => createMilestoneService('')).toThrow(GitHubClientError);
    });
});
//# sourceMappingURL=milestones.test.js.map