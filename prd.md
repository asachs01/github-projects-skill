# PRD: GitHub Projects Skill & Taskmaster Hook

## Overview

A product pair that transforms GitHub Projects into a conversational project management system, enabling natural language status updates, task management, and cross-project awareness through Claude interfaces.

**Components:**

1. **GitHub Projects Skill** - A Claude skill for conversational interaction with GitHub Projects via claude.ai
1. **Taskmaster Hook** - A Claude Code hook that syncs Taskmaster-generated tasks to GitHub Projects

## Problem Statement

Managing multiple software projects across personal and professional contexts requires constant context-switching between task generation tools, project boards, and status tracking. Current workflow involves:

- Taskmaster generates tasks from PRDs but tasks live in local `tasks.json` files
- GitHub Projects provides excellent Kanban/table views but requires manual issue creation
- Status updates require manually reviewing boards or writing standup notes
- No conversational interface exists to query project state naturally

The goal is to treat project management like human memory—ask “what’s blocking on DocuGen?” and get an immediate, contextual answer.

## Goals

1. Enable natural language queries against GitHub Projects (“what did I ship this week?”, “what’s blocking?”)
1. Automate flow of Taskmaster tasks into GitHub Issues on project boards
1. Support multiple organizations (personal projects, WYRE work projects)
1. Make GitHub Projects the single source of truth for task state
1. Minimize manual data entry and context-switching

## Non-Goals

1. Bidirectional sync back to Taskmaster’s tasks.json (GitHub is source of truth once tasks land there)
1. Replacing GitHub’s native UI for board manipulation
1. Supporting non-GitHub project management tools
1. Real-time notifications or webhooks (polling/on-demand queries only)
1. Multi-user collaboration features (single-user focus initially)

## User Stories

### Status Queries

- “What’s the status on DocuGen?” → Returns summary of in-progress items, blocked items, recently completed
- “What’s blocking right now?” → Lists issues in Blocked column or with blocked label across projects
- “What did I ship this week?” → Shows issues closed in last 7 days
- “Give me a standup summary” → Aggregates status across all active projects
- “What’s next up for AFKBot?” → Shows top items in Backlog/Ready column

### Task Management

- “Create an issue for webhook timeout handling in TicketBridge” → Creates issue, places on appropriate board
- “Move the auth refactor to in-progress” → Updates project item status
- “Add a note to the database migration task: need to coordinate with DevOps” → Adds comment to issue
- “Mark the API rate limiting task as blocked by vendor response” → Sets blocked status with reason
- “Link task #47 to PR #52” → Associates issue with pull request

### Planning & Triage

- “What’s in the backlog for DocuGen?” → Lists all backlog items
- “Prioritize the caching implementation—move it to top of ready” → Reorders board
- “Create a milestone for v1.0 launch with target date March 15” → Creates milestone
- “How many open issues do I have across all projects?” → Aggregate count

### Taskmaster Integration

- When Taskmaster generates tasks from a PRD, hook automatically creates corresponding GitHub issues
- Issues are created with appropriate labels, placed on correct project board
- Task dependencies in Taskmaster map to issue references/links in GitHub
- Task metadata (priority, complexity) maps to issue labels or custom fields

## Technical Architecture

### Component 1: GitHub Projects Skill

**Location:** Claude.ai skill (user-uploaded or distributed)

**Dependencies:**

- GitHub Personal Access Token or GitHub App credentials
- GitHub GraphQL API (Projects v2)
- GitHub REST API (Issues, Repositories)

**Skill Structure:**

```
github-projects/
├── SKILL.md
├── references/
│   ├── graphql-queries.md      # Common GraphQL queries for Projects v2
│   ├── field-mappings.md       # Status field value mappings
│   └── api-patterns.md         # API interaction patterns
└── scripts/
    └── (none initially - Claude generates API calls)
```

**Configuration (stored in skill or user-provided):**

```yaml
projects:
  - name: "DocuGen"
    org: "your-org"
    project_number: 1
    repo: "your-org/docugen"
  - name: "AFKBot"
    org: "your-org"
    project_number: 2
    repo: "your-org/afkbot"
  - name: "WYRE-Internal"
    org: "wyre-technology"
    project_number: 5
    repos:
      - "wyre-technology/client-tools"
      - "wyre-technology/automation-scripts"

status_field_mapping:
  backlog: "Backlog"
  ready: "Ready"
  in_progress: "In Progress"
  blocked: "Blocked"
  done: "Done"

labels:
  blocked_prefix: "blocked:"
  priority_prefix: "priority:"
  type_prefix: "type:"
```

**Required GitHub Token Scopes:**

- `repo` (full repository access for issues)
- `project` (read/write access to projects)
- `read:org` (for organization project access)

### Component 2: Taskmaster Hook

**Location:** Claude Code MCP hook or standalone script

**Trigger:** Runs after Taskmaster task generation, or on-demand

**Input:** Taskmaster’s `tasks.json` file

**Output:** GitHub Issues created and placed on project board

**Hook Flow:**

```
1. Read tasks.json from Taskmaster output
2. For each task not yet synced:
   a. Create GitHub Issue with:
      - Title: task.title
      - Body: task.description + acceptance criteria + dependencies
      - Labels: derived from task.priority, task.tags
   b. Add issue to GitHub Project board
   c. Set initial status (Backlog or Ready based on dependencies)
   d. Store GitHub issue URL back in tasks.json (optional, for reference)
3. Handle task dependencies:
   - If task has dependencies, add "Depends on #X" references in body
   - Optionally use GitHub's task list syntax for sub-tasks
```

**Taskmaster Task → GitHub Issue Mapping:**

|Taskmaster Field|GitHub Issue Field                                              |
|----------------|----------------------------------------------------------------|
|`id`            |Referenced in body as “Taskmaster ID: X”                        |
|`title`         |Issue title                                                     |
|`description`   |Issue body (main content)                                       |
|`details`       |Issue body (additional section)                                 |
|`priority`      |Label: `priority:high`, `priority:medium`, `priority:low`       |
|`dependencies`  |Body text: “Depends on #X, #Y” + blocked status if deps not done|
|`testStrategy`  |Issue body section: “## Test Strategy”                          |

**Hook Configuration:**

```yaml
taskmaster:
  tasks_file: "./tasks/tasks.json"
  
github:
  default_org: "your-org"
  default_project_number: 1
  
mapping:
  # Which project board to use (can be overridden per-PRD)
  project_selector: "repo"  # or "explicit" with project_number in PRD
  
  # Initial status for new tasks
  initial_status: "Backlog"
  initial_status_if_no_deps: "Ready"
  
  # Label mappings
  priority_labels:
    high: "priority:high"
    medium: "priority:medium"
    low: "priority:low"
```

## Data Models

### Project Configuration

```typescript
interface ProjectConfig {
  name: string;           // Human-readable name for queries ("DocuGen")
  org: string;            // GitHub org or username
  projectNumber: number;  // GitHub Project number
  repos: string[];        // Associated repositories
}
```

### Status Query Response

```typescript
interface ProjectStatus {
  project: string;
  summary: {
    inProgress: number;
    blocked: number;
    ready: number;
    backlog: number;
    completedThisWeek: number;
  };
  inProgressItems: ProjectItem[];
  blockedItems: ProjectItem[];
  recentlyCompleted: ProjectItem[];
}

interface ProjectItem {
  id: string;
  title: string;
  status: string;
  url: string;
  assignee?: string;
  labels: string[];
  updatedAt: string;
  blockedReason?: string;
}
```

### Taskmaster Sync State

```typescript
interface SyncState {
  lastSyncedAt: string;
  taskMappings: {
    [taskmasterId: string]: {
      githubIssueNumber: number;
      githubIssueUrl: string;
      syncedAt: string;
    };
  };
}
```

## API Requirements

### GitHub GraphQL Queries Needed

1. **List Projects for Org/User**
1. **Get Project Items with Status** (with pagination)
1. **Get Project Field Definitions** (to understand status field IDs)
1. **Add Item to Project**
1. **Update Project Item Field** (change status)
1. **Get Project Item by Issue**

### GitHub REST API Endpoints Needed

1. `POST /repos/{owner}/{repo}/issues` - Create issue
1. `PATCH /repos/{owner}/{repo}/issues/{issue_number}` - Update issue
1. `POST /repos/{owner}/{repo}/issues/{issue_number}/comments` - Add comment
1. `GET /repos/{owner}/{repo}/issues` - List issues (with filters)
1. `POST /repos/{owner}/{repo}/milestones` - Create milestone

## Implementation Phases

### Phase 1: Core Skill (MVP)

- Project configuration via skill references
- Status queries: single project status, blocked items, recent completions
- Basic task creation: create issue and add to board
- Manual token configuration

**Deliverables:**

- `SKILL.md` with query patterns
- `references/graphql-queries.md` with tested queries
- `references/config-example.md` with setup instructions

### Phase 2: Taskmaster Hook

- Hook script that reads tasks.json
- Creates issues with proper mapping
- Adds issues to project board with initial status
- Handles dependencies (references in body)
- Sync state tracking to avoid duplicates

**Deliverables:**

- Hook script (Python or TypeScript)
- Configuration schema
- Integration documentation

### Phase 3: Enhanced Queries

- Cross-project queries (“what’s blocking across all projects?”)
- Time-based queries (“what did I ship this week?”)
- Standup summary generation
- Natural language status field updates

### Phase 4: Advanced Features

- Milestone management
- PR linking suggestions
- Backlog prioritization
- Project health metrics

## Success Metrics

1. **Adoption:** Skill is used for daily standups/status checks
1. **Efficiency:** Time from Taskmaster output to issues-on-board < 1 minute
1. **Accuracy:** Status queries return correct, current information
1. **Coverage:** All active projects accessible via conversational queries

## Open Questions

1. **Authentication in Skill:** How does Claude.ai skill access GitHub token securely? Options:
- User pastes token in conversation (not ideal)
- Skill references config file with token
- Future: GitHub MCP connector in Claude.ai
1. **Project Discovery:** Should skill auto-discover projects, or require explicit configuration?
1. **Conflict Handling:** If a task already exists (by title match), should hook skip, update, or prompt?
1. **Subtask Handling:** Should Taskmaster subtasks become:
- Separate issues linked to parent
- Task list checkboxes within parent issue
- Ignored (only top-level tasks sync)

## Appendix: Example Interactions

### Status Query Flow

```
User: What's the status on DocuGen?

Claude: [Queries GitHub Projects API]

DocuGen has 3 items in progress, 1 blocked, and 2 completed this week.

**In Progress:**
- Implement PDF export (#23) - started 2 days ago
- Add user authentication (#21) - started yesterday  
- Write API documentation (#25) - started today

**Blocked:**
- Database migration (#19) - blocked by: waiting on DevOps approval

**Recently Completed:**
- Setup CI/CD pipeline (#15) - closed Monday
- Create landing page (#17) - closed Tuesday

Want me to drill into any of these?
```

### Taskmaster Sync Flow

```
[Taskmaster generates 8 tasks from PRD]

Hook output:
✓ Created issue #31: "Implement webhook endpoint"
✓ Created issue #32: "Add request validation"
✓ Created issue #33: "Implement retry logic" (depends on #31)
✓ Created issue #34: "Add monitoring/alerting"
...
✓ Added 8 issues to DocuGen project board
✓ 5 tasks marked Ready, 3 marked Backlog (have dependencies)
```
