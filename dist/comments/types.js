/**
 * Comment and note management types for GitHub REST API
 */
/**
 * Error thrown when no matching issue is found
 */
export class IssueNotFoundError extends Error {
    query;
    suggestions;
    constructor(query, suggestions) {
        const message = suggestions && suggestions.length > 0
            ? `No issue found matching "${query}". Did you mean: ${suggestions.join(', ')}?`
            : `No issue found matching "${query}"`;
        super(message);
        this.query = query;
        this.suggestions = suggestions;
        this.name = 'IssueNotFoundError';
    }
}
/**
 * Error thrown when multiple issues match ambiguously
 */
export class AmbiguousIssueMatchError extends Error {
    query;
    matches;
    constructor(query, matches) {
        const matchList = matches.map(m => `#${m.number}: ${m.title}`).join(', ');
        super(`Multiple issues match "${query}": ${matchList}. Please be more specific.`);
        this.query = query;
        this.matches = matches;
        this.name = 'AmbiguousIssueMatchError';
    }
}
//# sourceMappingURL=types.js.map