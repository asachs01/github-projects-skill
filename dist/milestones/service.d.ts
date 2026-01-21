/**
 * Milestone management service using GitHub REST API
 */
import { GitHubClient } from '../github/client.js';
import type { CreateMilestoneInput, UpdateMilestoneInput, ListMilestonesInput, AssignMilestoneInput, Milestone, AssignMilestoneResult, MilestoneServiceOptions, MilestoneRequest } from './types.js';
/**
 * Milestone service for creating and managing GitHub milestones
 */
export declare class MilestoneService {
    private token;
    private githubClient;
    constructor(options: MilestoneServiceOptions);
    /**
     * Create a new milestone in a repository
     */
    createMilestone(input: CreateMilestoneInput): Promise<Milestone>;
    /**
     * Update an existing milestone
     */
    updateMilestone(input: UpdateMilestoneInput): Promise<Milestone>;
    /**
     * Get a milestone by number
     */
    getMilestone(owner: string, repo: string, milestoneNumber: number): Promise<Milestone>;
    /**
     * List milestones for a repository
     */
    listMilestones(input: ListMilestonesInput): Promise<Milestone[]>;
    /**
     * Delete a milestone
     */
    deleteMilestone(owner: string, repo: string, milestoneNumber: number): Promise<void>;
    /**
     * Assign a milestone to an issue
     */
    assignMilestoneToIssue(input: AssignMilestoneInput): Promise<AssignMilestoneResult>;
    /**
     * Find a milestone by title (fuzzy match)
     */
    findMilestoneByTitle(owner: string, repo: string, title: string): Promise<Milestone | null>;
    /**
     * Parse natural language milestone request
     * Supports formats like:
     * - "create milestone Sprint 1"
     * - "create milestone Sprint 1 due next Friday"
     * - "create milestone Q1 2024 for project-name"
     * - "list milestones"
     * - "list milestones for project-name"
     */
    parseMilestoneRequest(input: string): MilestoneRequest | null;
    /**
     * Parse a natural language date into ISO 8601 format
     * Handles: "next Friday", "in 2 weeks", "2024-12-31", "December 31, 2024"
     */
    parseDueDate(dateStr: string): string | null;
    /**
     * Get the underlying GitHub client for advanced operations
     */
    getGitHubClient(): GitHubClient;
    /**
     * Map GitHub API response to simplified Milestone type
     */
    private mapToMilestone;
}
/**
 * Create a milestone service instance
 */
export declare function createMilestoneService(token: string): MilestoneService;
//# sourceMappingURL=service.d.ts.map