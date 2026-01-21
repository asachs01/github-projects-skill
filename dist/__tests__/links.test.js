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
import { createLinkService, LinkService } from '../links/service.js';
import { PRNotFoundError, IssueNotFoundError } from '../links/types.js';
// Helper to create mock PR response
function createMockPR(number, title, state = 'open', branch = 'feature-branch') {
    return {
        number,
        title,
        state,
        html_url: `https://github.com/owner/repo/pull/${number}`,
        head: { ref: branch },
        body: `PR body for ${title}`,
        user: { login: 'author' },
        merged_at: state === 'closed' ? '2024-01-15T00:00:00Z' : null,
    };
}
// Helper to create mock issue for REST API
function createMockRestIssue(number, title, state = 'open') {
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
        closed_at: state === 'closed' ? '2024-01-15T00:00:00Z' : null,
    };
}
// Helper to create mock timeline event
function createMockTimelineEvent(prNumber, prTitle, eventType = 'cross-referenced') {
    return {
        id: prNumber * 100,
        event: eventType,
        actor: { id: 1, login: 'user' },
        source: {
            type: 'issue',
            issue: {
                number: prNumber,
                title: prTitle,
                html_url: `https://github.com/owner/repo/pull/${prNumber}`,
                pull_request: {
                    url: `https://api.github.com/repos/owner/repo/pulls/${prNumber}`,
                    html_url: `https://github.com/owner/repo/pull/${prNumber}`,
                    merged_at: null,
                },
            },
        },
        created_at: '2024-01-10T00:00:00Z',
    };
}
describe('LinkService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    describe('createLinkService', () => {
        it('creates a service with valid token', () => {
            const service = createLinkService('test-token');
            expect(service).toBeInstanceOf(LinkService);
        });
        it('throws on missing token', () => {
            expect(() => createLinkService('')).toThrow('GitHub token is required');
        });
        it('accepts custom minSuggestionConfidence option', () => {
            const service = createLinkService('test-token', { minSuggestionConfidence: 0.7 });
            expect(service).toBeInstanceOf(LinkService);
        });
    });
    describe('linkPRToIssue', () => {
        it('links a PR to an issue by adding a comment', async () => {
            // Mock getPR
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(createMockPR(45, 'Fix authentication')),
            });
            // Mock addComment
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    html_url: 'https://github.com/owner/repo/issues/12#issuecomment-123',
                }),
            });
            const service = createLinkService('test-token');
            const result = await service.linkPRToIssue({
                owner: 'owner',
                repo: 'repo',
                issueNumber: 12,
                prNumber: 45,
            });
            expect(result.success).toBe(true);
            expect(result.issueNumber).toBe(12);
            expect(result.prNumber).toBe(45);
            expect(result.message).toContain('Successfully linked');
            expect(result.commentUrl).toBe('https://github.com/owner/repo/issues/12#issuecomment-123');
        });
        it('links a PR with custom message', async () => {
            // Mock getPR
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(createMockPR(45, 'Fix authentication')),
            });
            // Mock addComment
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    html_url: 'https://github.com/owner/repo/issues/12#issuecomment-123',
                }),
            });
            const service = createLinkService('test-token');
            const result = await service.linkPRToIssue({
                owner: 'owner',
                repo: 'repo',
                issueNumber: 12,
                prNumber: 45,
                message: 'This PR implements the authentication feature',
            });
            expect(result.success).toBe(true);
            // Verify the comment body includes the custom message
            const commentCall = mockFetch.mock.calls[1];
            const body = JSON.parse(commentCall[1].body);
            expect(body.body).toContain('This PR implements the authentication feature');
            expect(body.body).toContain('Linked to PR #45');
        });
        it('throws PRNotFoundError when PR does not exist', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
                text: () => Promise.resolve('Not Found'),
            });
            const service = createLinkService('test-token');
            await expect(service.linkPRToIssue({
                owner: 'owner',
                repo: 'repo',
                issueNumber: 12,
                prNumber: 999,
            })).rejects.toThrow(PRNotFoundError);
        });
        it('throws on issue not found (404)', async () => {
            // Mock getPR success
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(createMockPR(45, 'Fix authentication')),
            });
            // Mock addComment 404
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
                text: () => Promise.resolve('Not Found'),
            });
            const service = createLinkService('test-token');
            await expect(service.linkPRToIssue({
                owner: 'owner',
                repo: 'repo',
                issueNumber: 999,
                prNumber: 45,
            })).rejects.toThrow('Issue #999 not found');
        });
        it('throws on authentication failure (401)', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(createMockPR(45, 'Fix')),
            });
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
                text: () => Promise.resolve('Bad credentials'),
            });
            const service = createLinkService('invalid-token');
            await expect(service.linkPRToIssue({
                owner: 'owner',
                repo: 'repo',
                issueNumber: 12,
                prNumber: 45,
            })).rejects.toThrow('Authentication failed');
        });
    });
    describe('findLinkedPRs', () => {
        it('finds PRs linked via cross-reference', async () => {
            // Mock timeline
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve([
                    createMockTimelineEvent(45, 'Fix authentication bug'),
                    createMockTimelineEvent(46, 'Add tests'),
                ]),
            });
            // Mock PR state checks
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ state: 'open', merged_at: null }),
            });
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ state: 'closed', merged_at: '2024-01-15T00:00:00Z' }),
            });
            // Mock search for closing PRs
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ items: [] }),
            });
            const service = createLinkService('test-token');
            const links = await service.findLinkedPRs({
                owner: 'owner',
                repo: 'repo',
                issueNumber: 12,
            });
            expect(links).toHaveLength(2);
            expect(links[0].prNumber).toBe(45);
            expect(links[0].prTitle).toBe('Fix authentication bug');
            expect(links[0].linkType).toBe('referenced');
            expect(links[1].prNumber).toBe(46);
        });
        it('includes PRs with closing keywords', async () => {
            // Mock timeline (empty)
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve([]),
            });
            // Mock search for closing PRs
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    items: [
                        {
                            number: 50,
                            title: 'Fix: resolve issue #12',
                            html_url: 'https://github.com/owner/repo/pull/50',
                            state: 'open',
                            pull_request: { merged_at: null },
                            user: { login: 'developer' },
                            created_at: '2024-01-10T00:00:00Z',
                        },
                    ],
                }),
            });
            const service = createLinkService('test-token');
            const links = await service.findLinkedPRs({
                owner: 'owner',
                repo: 'repo',
                issueNumber: 12,
            });
            expect(links).toHaveLength(1);
            expect(links[0].prNumber).toBe(50);
            expect(links[0].linkType).toBe('closing');
        });
        it('returns empty array when no links exist', async () => {
            // Mock timeline (empty)
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve([]),
            });
            // Mock search (empty)
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ items: [] }),
            });
            const service = createLinkService('test-token');
            const links = await service.findLinkedPRs({
                owner: 'owner',
                repo: 'repo',
                issueNumber: 12,
            });
            expect(links).toHaveLength(0);
        });
        it('throws on issue not found (404)', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
                text: () => Promise.resolve('Not Found'),
            });
            const service = createLinkService('test-token');
            await expect(service.findLinkedPRs({
                owner: 'owner',
                repo: 'repo',
                issueNumber: 999,
            })).rejects.toThrow('Issue #999 not found');
        });
    });
    describe('suggestPRLinks', () => {
        it('suggests PRs based on title matching', async () => {
            // Mock getOpenIssues
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve([
                    createMockRestIssue(12, 'User authentication login'),
                    createMockRestIssue(13, 'Profile page display'),
                ]),
            });
            // Mock getOpenPRs - PR 45 references issue #12 in body
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve([
                    {
                        ...createMockPR(45, 'User authentication login fix', 'open', 'feature/auth'),
                        body: 'Fixes #12 - implements login', // Explicit issue reference
                    },
                    createMockPR(46, 'Docs update', 'open', 'docs-update'),
                ]),
            });
            // Mock findLinkedPRs timeline for issue 12
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve([]),
            });
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ items: [] }),
            });
            // Mock findLinkedPRs timeline for issue 13
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve([]),
            });
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ items: [] }),
            });
            const service = createLinkService('test-token', { minSuggestionConfidence: 0.3 });
            const suggestions = await service.suggestPRLinks({
                owner: 'owner',
                repo: 'repo',
            });
            // Should suggest PR 45 for issue 12 (explicit issue reference in PR body)
            const authSuggestion = suggestions.find((s) => s.issueNumber === 12 && s.suggestedPR.number === 45);
            expect(authSuggestion).toBeDefined();
            expect(authSuggestion.confidence).toBeGreaterThan(0.9); // High confidence due to explicit reference
        });
        it('suggests PRs based on issue number in branch name', async () => {
            // Mock getOpenIssues
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve([createMockRestIssue(12, 'Fix login bug')]),
            });
            // Mock getOpenPRs
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve([createMockPR(45, 'Bug fix', 'open', 'fix/issue-12')]),
            });
            // Mock findLinkedPRs
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve([]),
            });
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ items: [] }),
            });
            const service = createLinkService('test-token');
            const suggestions = await service.suggestPRLinks({
                owner: 'owner',
                repo: 'repo',
                issueNumber: 12,
            });
            expect(suggestions).toHaveLength(1);
            expect(suggestions[0].confidence).toBeGreaterThanOrEqual(0.9);
            expect(suggestions[0].reason).toContain('issue number');
        });
        it('skips already linked PRs', async () => {
            // Mock getOpenIssues
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve([createMockRestIssue(12, 'Authentication')]),
            });
            // Mock getOpenPRs
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve([createMockPR(45, 'Add auth', 'open', 'feature/auth')]),
            });
            // Mock findLinkedPRs - PR 45 is already linked
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve([createMockTimelineEvent(45, 'Add auth')]),
            });
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ state: 'open', merged_at: null }),
            });
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ items: [] }),
            });
            const service = createLinkService('test-token');
            const suggestions = await service.suggestPRLinks({
                owner: 'owner',
                repo: 'repo',
                issueNumber: 12,
            });
            // Should not suggest PR 45 since it's already linked
            expect(suggestions.find((s) => s.suggestedPR.number === 45)).toBeUndefined();
        });
        it('returns empty array when no issues match', async () => {
            // Mock getOpenIssues
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve([createMockRestIssue(99, 'Other issue')]),
            });
            const service = createLinkService('test-token');
            const suggestions = await service.suggestPRLinks({
                owner: 'owner',
                repo: 'repo',
                issueNumber: 12, // Doesn't exist in the list
            });
            expect(suggestions).toHaveLength(0);
        });
    });
    describe('parseLinkRequest', () => {
        it('parses "link issue #X to PR #Y" format', () => {
            const service = createLinkService('test-token');
            const result = service.parseLinkRequest('link issue #12 to PR #45');
            expect(result).toEqual({
                action: 'link',
                issueQuery: '12',
                prNumber: 45,
            });
        });
        it('parses "link #X to PR #Y" format (without issue keyword)', () => {
            const service = createLinkService('test-token');
            const result = service.parseLinkRequest('link #12 to PR #45');
            expect(result).toEqual({
                action: 'link',
                issueQuery: '12',
                prNumber: 45,
            });
        });
        it('parses "link task [query] to PR #Y" format', () => {
            const service = createLinkService('test-token');
            const result = service.parseLinkRequest('link task PDF extraction to PR #45');
            expect(result).toEqual({
                action: 'link',
                issueQuery: 'PDF extraction',
                prNumber: 45,
            });
        });
        it('parses "what PRs are linked to #X" format', () => {
            const service = createLinkService('test-token');
            const result = service.parseLinkRequest('what PRs are linked to #12');
            expect(result).toEqual({
                action: 'find',
                issueQuery: '12',
            });
        });
        it('parses "find PRs for [query]" format', () => {
            const service = createLinkService('test-token');
            const result = service.parseLinkRequest('find PRs for authentication task');
            expect(result).toEqual({
                action: 'find',
                issueQuery: 'authentication task',
            });
        });
        it('parses "suggest PRs for in-progress issues" format', () => {
            const service = createLinkService('test-token');
            const result = service.parseLinkRequest('suggest PRs for in-progress issues');
            expect(result).toEqual({
                action: 'suggest',
            });
        });
        it('parses "suggest PR links" format', () => {
            const service = createLinkService('test-token');
            const result = service.parseLinkRequest('suggest PR links');
            expect(result).toEqual({
                action: 'suggest',
            });
        });
        it('returns null for invalid format', () => {
            const service = createLinkService('test-token');
            expect(service.parseLinkRequest('invalid input')).toBeNull();
            expect(service.parseLinkRequest('')).toBeNull();
            expect(service.parseLinkRequest('create issue')).toBeNull();
        });
    });
});
describe('Error types', () => {
    describe('PRNotFoundError', () => {
        it('creates error with PR number', () => {
            const error = new PRNotFoundError(45);
            expect(error.name).toBe('PRNotFoundError');
            expect(error.prNumber).toBe(45);
            expect(error.message).toBe('Pull request #45 not found');
        });
        it('creates error with repo info', () => {
            const error = new PRNotFoundError(45, 'owner', 'repo');
            expect(error.owner).toBe('owner');
            expect(error.repo).toBe('repo');
            expect(error.message).toBe('Pull request #45 not found in owner/repo');
        });
    });
    describe('IssueNotFoundError', () => {
        it('creates error with number identifier', () => {
            const error = new IssueNotFoundError(12);
            expect(error.name).toBe('IssueNotFoundError');
            expect(error.issueIdentifier).toBe(12);
            expect(error.message).toBe('Issue "12" not found');
        });
        it('creates error with string identifier', () => {
            const error = new IssueNotFoundError('PDF extraction');
            expect(error.issueIdentifier).toBe('PDF extraction');
            expect(error.message).toBe('Issue "PDF extraction" not found');
        });
        it('creates error with suggestions', () => {
            const error = new IssueNotFoundError('PDF', ['PDF extraction', 'PDF viewer']);
            expect(error.suggestions).toEqual(['PDF extraction', 'PDF viewer']);
            expect(error.message).toContain('Did you mean');
        });
    });
});
describe('GitHubClientError usage in LinkService', () => {
    it('uses GitHubClientError for token validation', () => {
        expect(() => createLinkService('')).toThrow(GitHubClientError);
    });
});
//# sourceMappingURL=links.test.js.map