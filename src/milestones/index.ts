/**
 * Milestone management module exports
 */

export { MilestoneService, createMilestoneService } from './service.js';

export type {
  CreateMilestoneInput,
  UpdateMilestoneInput,
  ListMilestonesInput,
  AssignMilestoneInput,
  GitHubMilestoneResponse,
  Milestone,
  AssignMilestoneResult,
  MilestoneServiceOptions,
  MilestoneRequest,
} from './types.js';

export { MilestoneNotFoundError } from './types.js';
