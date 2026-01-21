import { z } from 'zod';
export declare const ProjectConfigSchema: z.ZodObject<{
    name: z.ZodString;
    org: z.ZodString;
    projectNumber: z.ZodNumber;
    repo: z.ZodOptional<z.ZodString>;
    repos: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const StatusFieldMappingSchema: z.ZodObject<{
    backlog: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    ready: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    in_progress: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    blocked: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    done: z.ZodOptional<z.ZodDefault<z.ZodString>>;
}, z.core.$strip>;
export declare const LabelConfigSchema: z.ZodObject<{
    blocked_prefix: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    priority_prefix: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    type_prefix: z.ZodOptional<z.ZodDefault<z.ZodString>>;
}, z.core.$strip>;
export declare const GitHubConfigSchema: z.ZodObject<{
    token: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, z.core.$strip>;
export declare const ConfigSchema: z.ZodObject<{
    github: z.ZodOptional<z.ZodObject<{
        token: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    }, z.core.$strip>>;
    projects: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        org: z.ZodString;
        projectNumber: z.ZodNumber;
        repo: z.ZodOptional<z.ZodString>;
        repos: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    status_field_mapping: z.ZodOptional<z.ZodObject<{
        backlog: z.ZodOptional<z.ZodDefault<z.ZodString>>;
        ready: z.ZodOptional<z.ZodDefault<z.ZodString>>;
        in_progress: z.ZodOptional<z.ZodDefault<z.ZodString>>;
        blocked: z.ZodOptional<z.ZodDefault<z.ZodString>>;
        done: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    }, z.core.$strip>>;
    labels: z.ZodOptional<z.ZodObject<{
        blocked_prefix: z.ZodOptional<z.ZodDefault<z.ZodString>>;
        priority_prefix: z.ZodOptional<z.ZodDefault<z.ZodString>>;
        type_prefix: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type StatusFieldMapping = z.infer<typeof StatusFieldMappingSchema>;
export type LabelConfig = z.infer<typeof LabelConfigSchema>;
export type GitHubConfig = z.infer<typeof GitHubConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;
export interface NormalizedProjectConfig {
    name: string;
    org: string;
    projectNumber: number;
    repos: string[];
}
export interface NormalizedConfig {
    github: {
        token: string | undefined;
    };
    projects: NormalizedProjectConfig[];
    statusFieldMapping: Required<StatusFieldMapping>;
    labels: Required<LabelConfig>;
}
//# sourceMappingURL=config.d.ts.map