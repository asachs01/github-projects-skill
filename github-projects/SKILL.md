# GitHub Projects Skill

A conversational interface for managing GitHub Projects, enabling natural language status queries, task management, and cross-project awareness.

## Overview

This skill transforms GitHub Projects into a conversational project management system. Ask questions like "what's blocking on DocuGen?" and get immediate, contextual answers.

**Capabilities:**
- Query project status across multiple organizations
- Create and manage GitHub issues via natural language
- Update project item statuses
- Generate standup summaries
- Track what you shipped this week

## Setup

### 1. GitHub Token Configuration

Create a GitHub Personal Access Token with these scopes:
- `repo` - Full repository access for issues
- `project` - Read/write access to projects
- `read:org` - Organization project access

To create a token:
1. Go to GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Click "Generate new token"
3. Select the repositories you want to manage
4. Grant the permissions listed above
5. Copy the token

### 2. Project Configuration

Create a configuration file or provide project details when prompted. See `references/config-example.md` for the full configuration schema.

**Quick setup - provide these details:**
```yaml
projects:
  - name: "YourProject"        # Name for natural language queries
    org: "your-org"            # GitHub org or username
    project_number: 1          # Project number from URL
    repo: "your-org/your-repo" # Associated repository
```

## Usage Examples

### Status Queries

**Single project status:**
> "What's the status on DocuGen?"

Returns summary of in-progress items, blocked items, and recently completed work.

**Cross-project blocking:**
> "What's blocking right now?"

Lists all items in Blocked status across configured projects.

**Weekly summary:**
> "What did I ship this week?"

Shows issues closed in the last 7 days.

**Standup summary:**
> "Give me a standup summary"

Aggregates status across all active projects.

### Task Management

**Create issue:**
> "Create an issue for webhook timeout handling in TicketBridge"

Creates the issue and adds it to the appropriate project board.

**Update status:**
> "Move the auth refactor to in-progress"

Updates the project item status field.

**Add notes:**
> "Add a note to the database migration task: need to coordinate with DevOps"

Adds a comment to the matching issue.

**Mark blocked:**
> "Mark the API rate limiting task as blocked by vendor response"

Sets blocked status with reason.

### Planning

**View backlog:**
> "What's in the backlog for DocuGen?"

Lists all items in Backlog status.

**Aggregate counts:**
> "How many open issues do I have across all projects?"

Returns total count across configured projects.

## How It Works

This skill uses:
- **GitHub GraphQL API** (Projects v2) for project queries and updates
- **GitHub REST API** for issue creation and comments

When you ask a question, the skill:
1. Parses your natural language query
2. Identifies the target project(s) from your configuration
3. Executes the appropriate API calls
4. Formats the response conversationally

## Status Field Mapping

The skill maps natural language to GitHub Project status fields:

| Natural Language | GitHub Status |
|-----------------|---------------|
| backlog | Backlog |
| ready, next up | Ready |
| in progress, working on | In Progress |
| blocked, stuck | Blocked |
| done, completed, shipped | Done |

## Troubleshooting

**"Project not found"**
- Verify the project number in your configuration matches the URL
- Ensure your token has `project` scope

**"Permission denied"**
- Check token scopes include `repo`, `project`, and `read:org`
- For organization projects, ensure you have access to the org

**"Rate limited"**
- GitHub API has rate limits; wait a few minutes and retry
- Consider using a GitHub App for higher limits

## References

- [config-example.md](references/config-example.md) - Full configuration schema
- [graphql-queries.md](references/graphql-queries.md) - GraphQL query reference
- [field-mappings.md](references/field-mappings.md) - Status field mappings
- [api-patterns.md](references/api-patterns.md) - API interaction patterns
