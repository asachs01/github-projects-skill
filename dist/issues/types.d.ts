/**
 * Issue management types for GitHub REST API
 */
/**
 * Input for creating a new issue
 */
export interface CreateIssueInput {
    owner: string;
    repo: string;
    title: string;
    body?: string;
    labels?: string[];
    assignees?: string[];
    milestone?: number;
}
/**
 * Response from GitHub REST API when creating an issue
 */
export interface GitHubIssueResponse {
    id: number;
    node_id: string;
    number: number;
    title: string;
    body: string | null;
    state: 'open' | 'closed';
    html_url: string;
    url: string;
    labels: Array<{
        id: number;
        name: string;
        color: string;
        description: string | null;
    }>;
    assignees: Array<{
        id: number;
        login: string;
        avatar_url: string;
    }>;
    milestone: {
        id: number;
        number: number;
        title: string;
    } | null;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
}
/**
 * Simplified issue representation for internal use
 */
export interface Issue {
    id: number;
    nodeId: string;
    number: number;
    title: string;
    body: string | null;
    state: 'open' | 'closed';
    url: string;
    labels: string[];
    assignees: string[];
}
/**
 * Result from adding an issue to a project
 */
export interface AddIssueToProjectResult {
    itemId: string;
    issueNodeId: string;
}
/**
 * Result from setting issue status in a project
 */
export interface SetIssueStatusResult {
    itemId: string;
    status: string;
}
/**
 * Options for issue service operations
 */
export interface IssueServiceOptions {
    token: string;
}
//# sourceMappingURL=types.d.ts.map