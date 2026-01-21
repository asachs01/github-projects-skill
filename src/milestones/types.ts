/**
 * Milestone management types for GitHub REST API
 */

/**
 * Input for creating a new milestone
 */
export interface CreateMilestoneInput {
  owner: string;
  repo: string;
  title: string;
  description?: string;
  /** Due date in ISO 8601 format (e.g., "2024-12-31T23:59:59Z") */
  dueOn?: string;
  /** State of the milestone: open or closed */
  state?: 'open' | 'closed';
}

/**
 * Input for updating an existing milestone
 */
export interface UpdateMilestoneInput {
  owner: string;
  repo: string;
  milestoneNumber: number;
  title?: string;
  description?: string;
  dueOn?: string;
  state?: 'open' | 'closed';
}

/**
 * Input for listing milestones
 */
export interface ListMilestonesInput {
  owner: string;
  repo: string;
  /** Filter by state */
  state?: 'open' | 'closed' | 'all';
  /** Sort by: due_on or completeness */
  sort?: 'due_on' | 'completeness';
  /** Sort direction */
  direction?: 'asc' | 'desc';
}

/**
 * Input for assigning milestone to an issue
 */
export interface AssignMilestoneInput {
  owner: string;
  repo: string;
  issueNumber: number;
  milestoneNumber: number | null;
}

/**
 * Response from GitHub REST API when creating/updating a milestone
 */
export interface GitHubMilestoneResponse {
  id: number;
  node_id: string;
  number: number;
  title: string;
  description: string | null;
  state: 'open' | 'closed';
  open_issues: number;
  closed_issues: number;
  created_at: string;
  updated_at: string;
  due_on: string | null;
  closed_at: string | null;
  html_url: string;
  url: string;
  creator: {
    id: number;
    login: string;
    avatar_url: string;
  };
}

/**
 * Simplified milestone representation for internal use
 */
export interface Milestone {
  id: number;
  nodeId: string;
  number: number;
  title: string;
  description: string | null;
  state: 'open' | 'closed';
  openIssues: number;
  closedIssues: number;
  dueOn: string | null;
  url: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  /** Percentage of issues completed */
  progress: number;
}

/**
 * Result from assigning a milestone to an issue
 */
export interface AssignMilestoneResult {
  issueNumber: number;
  milestoneNumber: number | null;
  milestoneTitle: string | null;
}

/**
 * Options for milestone service operations
 */
export interface MilestoneServiceOptions {
  token: string;
}

/**
 * Parsed milestone request from natural language input
 */
export interface MilestoneRequest {
  /** Action to perform */
  action: 'create' | 'list' | 'assign';
  /** Milestone title (for create) */
  title?: string;
  /** Due date string (for create) */
  dueDate?: string;
  /** Description (for create) */
  description?: string;
  /** Project name or identifier */
  project?: string;
}

/**
 * Error thrown when milestone is not found
 */
export class MilestoneNotFoundError extends Error {
  constructor(
    public readonly identifier: string | number,
    public readonly suggestions?: string[]
  ) {
    const message = suggestions && suggestions.length > 0
      ? `Milestone "${identifier}" not found. Did you mean: ${suggestions.join(', ')}?`
      : `Milestone "${identifier}" not found`;
    super(message);
    this.name = 'MilestoneNotFoundError';
  }
}
