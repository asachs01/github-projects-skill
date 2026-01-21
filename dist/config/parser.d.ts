import { NormalizedConfig, NormalizedProjectConfig } from '../types/config.js';
/**
 * Parse and validate YAML configuration string
 */
export declare function parseConfigString(yamlContent: string): NormalizedConfig;
/**
 * Parse configuration from a file path
 */
export declare function parseConfigFile(filePath: string): NormalizedConfig;
/**
 * Find a project by name (case-insensitive)
 */
export declare function findProjectByName(config: NormalizedConfig, name: string): NormalizedProjectConfig | undefined;
/**
 * Get all configured project names
 */
export declare function getProjectNames(config: NormalizedConfig): string[];
//# sourceMappingURL=parser.d.ts.map