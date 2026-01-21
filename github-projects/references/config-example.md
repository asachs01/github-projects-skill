# Configuration Example

This document describes the configuration schema for the GitHub Projects Skill.

## Full Configuration Schema

```yaml
# GitHub Projects Skill Configuration

# GitHub Authentication
github:
  # Personal Access Token (required scopes: repo, project, read:org)
  # Can also be provided via GITHUB_TOKEN environment variable
  token: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Project Definitions
projects:
  # Single-repo project example
  - name: "DocuGen"
    org: "your-org"
    project_number: 1
    repo: "your-org/docugen"

  # Another single-repo project
  - name: "AFKBot"
    org: "your-org"
    project_number: 2
    repo: "your-org/afkbot"

  # Multi-repo project example (spans multiple repositories)
  - name: "WYRE-Internal"
    org: "wyre-technology"
    project_number: 5
    repos:
      - "wyre-technology/client-tools"
      - "wyre-technology/automation-scripts"

# Status Field Mapping
# Maps natural language terms to your GitHub Project's status field values
status_field_mapping:
  backlog: "Backlog"
  ready: "Ready"
  in_progress: "In Progress"
  blocked: "Blocked"
  done: "Done"

# Label Configuration
# Prefixes used for auto-generated labels
labels:
  blocked_prefix: "blocked:"      # e.g., "blocked:vendor-response"
  priority_prefix: "priority:"    # e.g., "priority:high"
  type_prefix: "type:"            # e.g., "type:bug"
```

## Configuration Fields

### `github`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | string | Yes* | GitHub Personal Access Token. *Can be provided via `GITHUB_TOKEN` env var instead. |

### `projects[]`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Human-readable name for natural language queries (e.g., "DocuGen") |
| `org` | string | Yes | GitHub organization or username |
| `project_number` | number | Yes | Project number from the GitHub URL |
| `repo` | string | No* | Single repository (e.g., "org/repo") |
| `repos` | string[] | No* | Multiple repositories for multi-repo projects |

*Either `repo` or `repos` should be provided.

### `status_field_mapping`

Maps internal status keys to your GitHub Project's actual status field values. Customize these to match your project board's column names.

### `labels`

Defines prefixes for automatically generated labels when creating issues.

## Finding Your Project Number

The project number is in the URL when viewing your project:

```
https://github.com/users/USERNAME/projects/2
                                          ^ project_number = 2

https://github.com/orgs/ORG-NAME/projects/5
                                         ^ project_number = 5
```

## Minimal Configuration

For a quick start, you only need:

```yaml
projects:
  - name: "MyProject"
    org: "my-username"
    project_number: 1
    repo: "my-username/my-repo"
```

The skill will use default status mappings if not specified.

## Environment Variables

Instead of including the token in configuration, you can set:

```bash
export GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

This is the recommended approach for security.
