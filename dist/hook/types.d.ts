import { z } from 'zod';
/**
 * Taskmaster Task Interface
 * Based on the format from .taskmaster/tasks/tasks.json
 */
export declare const TaskmasterTaskSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    description: z.ZodString;
    details: z.ZodOptional<z.ZodString>;
    testStrategy: z.ZodOptional<z.ZodString>;
    priority: z.ZodEnum<{
        high: "high";
        medium: "medium";
        low: "low";
    }>;
    dependencies: z.ZodDefault<z.ZodArray<z.ZodString>>;
    status: z.ZodEnum<{
        blocked: "blocked";
        done: "done";
        pending: "pending";
        "in-progress": "in-progress";
    }>;
    subtasks: z.ZodDefault<z.ZodArray<z.ZodAny>>;
    updatedAt: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type TaskmasterTask = z.infer<typeof TaskmasterTaskSchema>;
/**
 * Taskmaster tasks.json file structure
 */
export declare const TasksFileSchema: z.ZodObject<{
    master: z.ZodObject<{
        tasks: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            title: z.ZodString;
            description: z.ZodString;
            details: z.ZodOptional<z.ZodString>;
            testStrategy: z.ZodOptional<z.ZodString>;
            priority: z.ZodEnum<{
                high: "high";
                medium: "medium";
                low: "low";
            }>;
            dependencies: z.ZodDefault<z.ZodArray<z.ZodString>>;
            status: z.ZodEnum<{
                blocked: "blocked";
                done: "done";
                pending: "pending";
                "in-progress": "in-progress";
            }>;
            subtasks: z.ZodDefault<z.ZodArray<z.ZodAny>>;
            updatedAt: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        metadata: z.ZodObject<{
            version: z.ZodOptional<z.ZodString>;
            lastModified: z.ZodOptional<z.ZodString>;
            taskCount: z.ZodOptional<z.ZodNumber>;
            completedCount: z.ZodOptional<z.ZodNumber>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type TasksFile = z.infer<typeof TasksFileSchema>;
/**
 * Mapping between a Taskmaster task and its GitHub issue
 */
export interface TaskMapping {
    taskmasterId: string;
    githubIssueNumber: number;
    githubIssueUrl: string;
    projectItemId?: string;
    syncedAt: string;
}
/**
 * Sync state for tracking which tasks have been synced
 */
export declare const SyncStateSchema: z.ZodObject<{
    lastSyncAt: z.ZodOptional<z.ZodString>;
    taskMappings: z.ZodRecord<z.ZodString, z.ZodObject<{
        taskmasterId: z.ZodString;
        githubIssueNumber: z.ZodNumber;
        githubIssueUrl: z.ZodString;
        projectItemId: z.ZodOptional<z.ZodString>;
        syncedAt: z.ZodString;
    }, z.core.$strip>>;
    version: z.ZodDefault<z.ZodString>;
}, z.core.$strip>;
export type SyncState = z.infer<typeof SyncStateSchema>;
/**
 * Result of a sync operation for a single task
 */
export interface SyncResult {
    taskId: string;
    success: boolean;
    issueNumber?: number;
    issueUrl?: string;
    error?: string;
}
/**
 * Summary of a full sync operation
 */
export interface SyncSummary {
    totalTasks: number;
    newlySynced: number;
    alreadySynced: number;
    failed: number;
    results: SyncResult[];
}
//# sourceMappingURL=types.d.ts.map