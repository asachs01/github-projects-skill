import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import {
  ConfigSchema,
  Config,
  NormalizedConfig,
  NormalizedProjectConfig,
} from '../types/config.js';

// Default values for optional config fields
const DEFAULT_STATUS_MAPPING = {
  backlog: 'Backlog',
  ready: 'Ready',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
} as const;

const DEFAULT_LABELS = {
  blocked_prefix: 'blocked:',
  priority_prefix: 'priority:',
  type_prefix: 'type:',
} as const;

/**
 * Parse and validate YAML configuration string
 */
export function parseConfigString(yamlContent: string): NormalizedConfig {
  // Parse YAML to JavaScript object
  const rawConfig = yaml.load(yamlContent);

  if (typeof rawConfig !== 'object' || rawConfig === null) {
    throw new Error('Configuration must be a valid YAML object');
  }

  // Handle snake_case to camelCase conversion for projectNumber
  const configWithCamelCase = transformConfig(rawConfig as Record<string, unknown>);

  // Validate with Zod
  const validationResult = ConfigSchema.safeParse(configWithCamelCase);

  if (!validationResult.success) {
    const issues = validationResult.error.issues;
    const errors = issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration validation failed:\n${errors}`);
  }

  // Normalize the validated config
  return normalizeConfig(validationResult.data);
}

/**
 * Parse configuration from a file path
 */
export function parseConfigFile(filePath: string): NormalizedConfig {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Configuration file not found: ${absolutePath}`);
  }

  const content = fs.readFileSync(absolutePath, 'utf-8');
  return parseConfigString(content);
}

/**
 * Transform raw config to handle snake_case to camelCase conversion
 */
function transformConfig(raw: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...raw };

  // Transform projects array
  if (Array.isArray(raw.projects)) {
    result.projects = raw.projects.map((project: Record<string, unknown>) => {
      const transformed: Record<string, unknown> = { ...project };

      // Convert project_number to projectNumber
      if ('project_number' in project) {
        transformed.projectNumber = project.project_number;
        delete transformed.project_number;
      }

      return transformed;
    });
  }

  return result;
}

/**
 * Normalize validated config to consistent format
 */
function normalizeConfig(config: Config): NormalizedConfig {
  return {
    github: {
      token: config.github?.token ?? process.env.GITHUB_TOKEN,
    },
    projects: config.projects.map(normalizeProject),
    statusFieldMapping: {
      ...DEFAULT_STATUS_MAPPING,
      ...config.status_field_mapping,
    },
    labels: {
      ...DEFAULT_LABELS,
      ...config.labels,
    },
  };
}

/**
 * Normalize a single project config
 */
function normalizeProject(project: Config['projects'][number]): NormalizedProjectConfig {
  // Ensure repos is always an array
  let repos: string[];

  if (project.repos && project.repos.length > 0) {
    repos = project.repos;
  } else if (project.repo) {
    repos = [project.repo];
  } else {
    // This shouldn't happen due to Zod validation, but TypeScript needs it
    repos = [];
  }

  return {
    name: project.name,
    org: project.org,
    projectNumber: project.projectNumber,
    repos,
  };
}

/**
 * Find a project by name (case-insensitive)
 */
export function findProjectByName(
  config: NormalizedConfig,
  name: string
): NormalizedProjectConfig | undefined {
  const lowerName = name.toLowerCase();
  return config.projects.find((p) => p.name.toLowerCase() === lowerName);
}

/**
 * Get all configured project names
 */
export function getProjectNames(config: NormalizedConfig): string[] {
  return config.projects.map((p) => p.name);
}
