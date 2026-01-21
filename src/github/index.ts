export { GitHubClient, GitHubClientError, createGitHubClient } from './client.js';
export type { GitHubClientOptions } from './client.js';

export type {
  ProjectV2,
  ProjectItem,
  ProjectContext,
  ProjectField,
  ProjectSingleSelectField,
  ProjectFieldOption,
  IssueContent,
  PullRequestContent,
  PageInfo,
  RateLimitInfo,
  TokenInfo,
} from './types.js';

export {
  GET_USER_PROJECT,
  GET_ORG_PROJECT,
  GET_USER_PROJECTS,
  GET_ORG_PROJECTS,
  GET_PROJECT_ITEMS,
  GET_PROJECT_FIELDS,
  ADD_PROJECT_ITEM,
  UPDATE_PROJECT_ITEM_FIELD,
} from './queries.js';
