import { z } from 'zod';
// Zod schema for a single project configuration
export const ProjectConfigSchema = z.object({
    name: z.string().min(1, 'Project name is required'),
    org: z.string().min(1, 'Organization/username is required'),
    projectNumber: z.number().int().positive('Project number must be a positive integer'),
    // Support both single repo and multiple repos
    repo: z.string().regex(/^[^/]+\/[^/]+$/, 'Repo must be in format "owner/repo"').optional(),
    repos: z.array(z.string().regex(/^[^/]+\/[^/]+$/, 'Each repo must be in format "owner/repo"')).optional(),
}).refine((data) => data.repo !== undefined || (data.repos !== undefined && data.repos.length > 0), { message: 'Either "repo" or "repos" must be provided' });
// Zod schema for status field mapping
export const StatusFieldMappingSchema = z.object({
    backlog: z.string().default('Backlog'),
    ready: z.string().default('Ready'),
    in_progress: z.string().default('In Progress'),
    blocked: z.string().default('Blocked'),
    done: z.string().default('Done'),
}).partial();
// Zod schema for label configuration
export const LabelConfigSchema = z.object({
    blocked_prefix: z.string().default('blocked:'),
    priority_prefix: z.string().default('priority:'),
    type_prefix: z.string().default('type:'),
}).partial();
// Zod schema for GitHub configuration
export const GitHubConfigSchema = z.object({
    token: z.string().optional(),
}).partial();
// Complete configuration schema
export const ConfigSchema = z.object({
    github: GitHubConfigSchema.optional(),
    projects: z.array(ProjectConfigSchema).min(1, 'At least one project must be configured'),
    status_field_mapping: StatusFieldMappingSchema.optional(),
    labels: LabelConfigSchema.optional(),
});
//# sourceMappingURL=config.js.map