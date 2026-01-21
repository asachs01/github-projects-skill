import { describe, it, expect } from 'vitest';
import { parseConfigString, findProjectByName, getProjectNames } from '../config/parser.js';

describe('Config Parser', () => {
  describe('parseConfigString', () => {
    it('parses minimal valid config with single repo', () => {
      const yaml = `
projects:
  - name: "DocuGen"
    org: "your-org"
    project_number: 1
    repo: "your-org/docugen"
`;
      const config = parseConfigString(yaml);

      expect(config.projects).toHaveLength(1);
      expect(config.projects[0]).toEqual({
        name: 'DocuGen',
        org: 'your-org',
        projectNumber: 1,
        repos: ['your-org/docugen'],
      });
    });

    it('parses config with multiple repos', () => {
      const yaml = `
projects:
  - name: "WYRE-Internal"
    org: "wyre-technology"
    project_number: 5
    repos:
      - "wyre-technology/client-tools"
      - "wyre-technology/automation-scripts"
`;
      const config = parseConfigString(yaml);

      expect(config.projects[0].repos).toEqual([
        'wyre-technology/client-tools',
        'wyre-technology/automation-scripts',
      ]);
    });

    it('parses config with multiple projects', () => {
      const yaml = `
projects:
  - name: "DocuGen"
    org: "your-org"
    project_number: 1
    repo: "your-org/docugen"
  - name: "AFKBot"
    org: "your-org"
    project_number: 2
    repo: "your-org/afkbot"
`;
      const config = parseConfigString(yaml);

      expect(config.projects).toHaveLength(2);
      expect(config.projects[0].name).toBe('DocuGen');
      expect(config.projects[1].name).toBe('AFKBot');
    });

    it('applies default status mapping', () => {
      const yaml = `
projects:
  - name: "Test"
    org: "test"
    project_number: 1
    repo: "test/repo"
`;
      const config = parseConfigString(yaml);

      expect(config.statusFieldMapping).toEqual({
        backlog: 'Backlog',
        ready: 'Ready',
        in_progress: 'In Progress',
        blocked: 'Blocked',
        done: 'Done',
      });
    });

    it('overrides default status mapping', () => {
      const yaml = `
projects:
  - name: "Test"
    org: "test"
    project_number: 1
    repo: "test/repo"
status_field_mapping:
  backlog: "To Do"
  ready: "Up Next"
`;
      const config = parseConfigString(yaml);

      expect(config.statusFieldMapping.backlog).toBe('To Do');
      expect(config.statusFieldMapping.ready).toBe('Up Next');
      expect(config.statusFieldMapping.in_progress).toBe('In Progress'); // default
    });

    it('applies default label config', () => {
      const yaml = `
projects:
  - name: "Test"
    org: "test"
    project_number: 1
    repo: "test/repo"
`;
      const config = parseConfigString(yaml);

      expect(config.labels).toEqual({
        blocked_prefix: 'blocked:',
        priority_prefix: 'priority:',
        type_prefix: 'type:',
      });
    });

    it('throws on missing project name', () => {
      const yaml = `
projects:
  - org: "test"
    project_number: 1
    repo: "test/repo"
`;
      expect(() => parseConfigString(yaml)).toThrow('Configuration validation failed');
    });

    it('throws on missing both repo and repos', () => {
      const yaml = `
projects:
  - name: "Test"
    org: "test"
    project_number: 1
`;
      expect(() => parseConfigString(yaml)).toThrow('Either "repo" or "repos" must be provided');
    });

    it('throws on invalid repo format', () => {
      const yaml = `
projects:
  - name: "Test"
    org: "test"
    project_number: 1
    repo: "invalid-format"
`;
      expect(() => parseConfigString(yaml)).toThrow('Repo must be in format "owner/repo"');
    });

    it('throws on empty projects array', () => {
      const yaml = `
projects: []
`;
      expect(() => parseConfigString(yaml)).toThrow('At least one project must be configured');
    });

    it('throws on invalid YAML', () => {
      const yaml = `
not valid yaml: [
`;
      expect(() => parseConfigString(yaml)).toThrow();
    });
  });

  describe('findProjectByName', () => {
    const yaml = `
projects:
  - name: "DocuGen"
    org: "your-org"
    project_number: 1
    repo: "your-org/docugen"
  - name: "AFKBot"
    org: "your-org"
    project_number: 2
    repo: "your-org/afkbot"
`;

    it('finds project by exact name', () => {
      const config = parseConfigString(yaml);
      const project = findProjectByName(config, 'DocuGen');

      expect(project).toBeDefined();
      expect(project?.name).toBe('DocuGen');
    });

    it('finds project case-insensitively', () => {
      const config = parseConfigString(yaml);
      const project = findProjectByName(config, 'docugen');

      expect(project).toBeDefined();
      expect(project?.name).toBe('DocuGen');
    });

    it('returns undefined for unknown project', () => {
      const config = parseConfigString(yaml);
      const project = findProjectByName(config, 'Unknown');

      expect(project).toBeUndefined();
    });
  });

  describe('getProjectNames', () => {
    it('returns all project names', () => {
      const yaml = `
projects:
  - name: "DocuGen"
    org: "your-org"
    project_number: 1
    repo: "your-org/docugen"
  - name: "AFKBot"
    org: "your-org"
    project_number: 2
    repo: "your-org/afkbot"
`;
      const config = parseConfigString(yaml);
      const names = getProjectNames(config);

      expect(names).toEqual(['DocuGen', 'AFKBot']);
    });
  });
});
