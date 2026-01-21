/**
 * GitHub API response types for Projects v2
 */

// GraphQL node interface
export interface GitHubNode {
  id: string;
}

// Project field option (for single-select fields like Status)
export interface ProjectFieldOption {
  id: string;
  name: string;
}

// Project field types
export interface ProjectField extends GitHubNode {
  name: string;
  dataType?: string;
}

export interface ProjectSingleSelectField extends ProjectField {
  options: ProjectFieldOption[];
}

// Project item field values
export interface ProjectItemFieldValue {
  field: { name: string };
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

// Issue content
export interface IssueContent {
  id: string;
  number: number;
  title: string;
  url: string;
  state: 'OPEN' | 'CLOSED';
  labels: { nodes: Array<{ name: string }> };
  assignees: { nodes: Array<{ login: string }> };
  updatedAt: string;
  closedAt: string | null;
}

// Pull request content
export interface PullRequestContent {
  id: string;
  number: number;
  title: string;
  url: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  updatedAt: string;
  closedAt: string | null;
}

// Project item
export interface ProjectItem extends GitHubNode {
  fieldValues: {
    nodes: Array<ProjectItemFieldTextValue | ProjectItemFieldSingleSelectValue | ProjectItemFieldDateValue>;
  };
  content: IssueContent | PullRequestContent | null;
}

// Page info for pagination
export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

// Project v2
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

// API response types
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

// Token validation response (REST API)
export interface TokenInfo {
  login: string;
  id: number;
  scopes: string[];
}

// Rate limit info
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  used: number;
}

// Cache entry for project context
export interface ProjectContext {
  projectId: string;
  projectNumber: number;
  statusFieldId: string;
  statusOptions: Map<string, string>; // status name -> option id
  cachedAt: number;
}
