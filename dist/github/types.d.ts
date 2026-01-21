/**
 * GitHub API response types for Projects v2
 */
export interface GitHubNode {
    id: string;
}
export interface ProjectFieldOption {
    id: string;
    name: string;
}
export interface ProjectField extends GitHubNode {
    name: string;
    dataType?: string;
}
export interface ProjectSingleSelectField extends ProjectField {
    options: ProjectFieldOption[];
}
export interface ProjectItemFieldValue {
    field: {
        name: string;
    };
}
export interface ProjectItemFieldTextValue extends ProjectItemFieldValue {
    text: string;
}
export interface ProjectItemFieldSingleSelectValue extends ProjectItemFieldValue {
    name: string;
    optionId: string;
}
export interface ProjectItemFieldDateValue extends ProjectItemFieldValue {
    date: string;
}
export interface IssueContent {
    id: string;
    number: number;
    title: string;
    url: string;
    state: 'OPEN' | 'CLOSED';
    labels: {
        nodes: Array<{
            name: string;
        }>;
    };
    assignees: {
        nodes: Array<{
            login: string;
        }>;
    };
    updatedAt: string;
    closedAt: string | null;
}
export interface PullRequestContent {
    id: string;
    number: number;
    title: string;
    url: string;
    state: 'OPEN' | 'CLOSED' | 'MERGED';
    updatedAt: string;
    closedAt: string | null;
}
export interface ProjectItem extends GitHubNode {
    fieldValues: {
        nodes: Array<ProjectItemFieldTextValue | ProjectItemFieldSingleSelectValue | ProjectItemFieldDateValue>;
    };
    content: IssueContent | PullRequestContent | null;
}
export interface PageInfo {
    hasNextPage: boolean;
    endCursor: string | null;
}
export interface ProjectV2 extends GitHubNode {
    title: string;
    number: number;
    url: string;
    closed: boolean;
    fields?: {
        nodes: Array<ProjectField | ProjectSingleSelectField>;
    };
    items?: {
        pageInfo: PageInfo;
        nodes: ProjectItem[];
    };
}
export interface GetUserProjectsResponse {
    user: {
        projectsV2: {
            nodes: ProjectV2[];
        };
    };
}
export interface GetOrgProjectsResponse {
    organization: {
        projectsV2: {
            nodes: ProjectV2[];
        };
    };
}
export interface GetUserProjectResponse {
    user: {
        projectV2: ProjectV2 | null;
    };
}
export interface GetOrgProjectResponse {
    organization: {
        projectV2: ProjectV2 | null;
    };
}
export interface GetProjectNodeResponse {
    node: ProjectV2 | null;
}
export interface GetProjectItemsResponse {
    node: {
        items: {
            pageInfo: PageInfo;
            nodes: ProjectItem[];
        };
    } | null;
}
export interface AddProjectItemResponse {
    addProjectV2ItemById: {
        item: {
            id: string;
        };
    };
}
export interface UpdateProjectItemFieldResponse {
    updateProjectV2ItemFieldValue: {
        projectV2Item: {
            id: string;
        };
    };
}
export interface TokenInfo {
    login: string;
    id: number;
    scopes: string[];
}
export interface RateLimitInfo {
    limit: number;
    remaining: number;
    reset: number;
    used: number;
}
export interface ProjectContext {
    projectId: string;
    projectNumber: number;
    statusFieldId: string;
    statusOptions: Map<string, string>;
    cachedAt: number;
}
//# sourceMappingURL=types.d.ts.map