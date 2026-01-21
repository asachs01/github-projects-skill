/**
 * Milestone management types for GitHub REST API
 */
/**
 * Error thrown when milestone is not found
 */
export class MilestoneNotFoundError extends Error {
    identifier;
    suggestions;
    constructor(identifier, suggestions) {
        const message = suggestions && suggestions.length > 0
            ? `Milestone "${identifier}" not found. Did you mean: ${suggestions.join(', ')}?`
            : `Milestone "${identifier}" not found`;
        super(message);
        this.identifier = identifier;
        this.suggestions = suggestions;
        this.name = 'MilestoneNotFoundError';
    }
}
//# sourceMappingURL=types.js.map