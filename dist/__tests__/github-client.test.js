import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGitHubClient, GitHubClient, GitHubClientError } from '../github/client.js';
// Mock fetch for REST API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;
describe('GitHubClient', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    describe('createGitHubClient', () => {
        it('creates a client with valid token', () => {
            const client = createGitHubClient('test-token');
            expect(client).toBeInstanceOf(GitHubClient);
        });
        it('throws on missing token', () => {
            expect(() => createGitHubClient('')).toThrow('GitHub token is required');
        });
    });
    describe('validateToken', () => {
        it('returns user info on valid token', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: {
                    get: (name) => name === 'x-oauth-scopes' ? 'repo, project, read:org' : null,
                },
                json: () => Promise.resolve({ login: 'testuser' }),
            });
            const client = createGitHubClient('valid-token');
            const result = await client.validateToken();
            expect(result.login).toBe('testuser');
            expect(result.scopes).toContain('repo');
            expect(result.scopes).toContain('project');
        });
        it('throws on invalid token (401)', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
            });
            const client = createGitHubClient('invalid-token');
            await expect(client.validateToken()).rejects.toThrow('Invalid or expired GitHub token');
        });
        it('throws on missing required scopes', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: {
                    get: (name) => (name === 'x-oauth-scopes' ? 'read:org' : null),
                },
                json: () => Promise.resolve({ login: 'testuser' }),
            });
            const client = createGitHubClient('limited-token');
            await expect(client.validateToken()).rejects.toThrow('Token missing required scopes');
        });
    });
    describe('GitHubClientError', () => {
        it('preserves error details', () => {
            const error = new GitHubClientError('Test error', 404, false);
            expect(error.message).toBe('Test error');
            expect(error.statusCode).toBe(404);
            expect(error.isRetryable).toBe(false);
            expect(error.name).toBe('GitHubClientError');
        });
        it('marks rate limit errors as retryable', () => {
            const error = new GitHubClientError('Rate limited', 429, true);
            expect(error.isRetryable).toBe(true);
        });
    });
    describe('clearCache', () => {
        it('clears the project cache', () => {
            const client = createGitHubClient('test-token');
            // This just verifies the method exists and doesn't throw
            expect(() => client.clearCache()).not.toThrow();
        });
    });
});
describe('buildProjectContext (via getProject)', () => {
    // These tests would require mocking the GraphQL client
    // For now, we test the error cases that don't require actual API calls
    it('requires a token', () => {
        expect(() => createGitHubClient('')).toThrow(GitHubClientError);
    });
});
//# sourceMappingURL=github-client.test.js.map