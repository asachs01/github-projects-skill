/**
 * PR-Issue linking types for GitHub REST API
 */
/**
 * Error thrown when PR is not found
 */
export class PRNotFoundError extends Error {
    prNumber;
    owner;
    repo;
    constructor(prNumber, owner, repo) {
        const repoInfo = owner && repo ? ` in ${owner}/${repo}` : '';
        super(`Pull request #${prNumber} not found${repoInfo}`);
        this.prNumber = prNumber;
        this.owner = owner;
        this.repo = repo;
        this.name = 'PRNotFoundError';
    }
}
/**
 * Error thrown when issue is not found
 */
export class IssueNotFoundError extends Error {
    issueIdentifier;
    suggestions;
    constructor(issueIdentifier, suggestions) {
        const message = suggestions && suggestions.length > 0
            ? `Issue "${issueIdentifier}" not found. Did you mean: ${suggestions.join(', ')}?`
            : `Issue "${issueIdentifier}" not found`;
        super(message);
        this.issueIdentifier = issueIdentifier;
        this.suggestions = suggestions;
        this.name = 'IssueNotFoundError';
    }
}
//# sourceMappingURL=types.js.map