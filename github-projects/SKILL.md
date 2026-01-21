# GitHub Projects Skill

A conversational interface for managing GitHub Projects, enabling natural language status queries, task management, and cross-project awareness.

## Overview

This skill transforms GitHub Projects into a conversational project management system. Ask questions like "what's blocking on DocuGen?" and get immediate, contextual answers.

**Capabilities:**
- Query project status across multiple organizations
- Create and manage GitHub issues via natural language
- Update project item statuses with fuzzy matching
- Add comments and notes to issues
- Generate standup summaries and weekly reports
- Track what you shipped over various time periods
- Link PRs to issues with intelligent suggestions
- Cross-project aggregated queries

## Setup

### 1. GitHub Token Configuration

Create a GitHub Personal Access Token with these scopes:
- `repo` - Full repository access for issues and comments
- `project` - Read/write access to projects
- `read:org` - Organization project access

**Creating a Fine-Grained Token:**
1. Go to GitHub Settings > Developer settings > Personal access tokens > Fine-grained tokens
2. Click "Generate new token"
3. Select the repositories you want to manage
4. Grant the permissions listed above
5. Copy the token

**Creating a Classic Token:**
1. Go to GitHub Settings > Developer settings > Personal access tokens > Tokens (classic)
2. Click "Generate new token"
3. Select scopes: `repo`, `project`, `read:org`
4. Copy the token

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

**Project backlog:**
> "What's in the backlog for DocuGen?"

Lists all items in Backlog status.

**Aggregate counts:**
> "How many open issues do I have across all projects?"

Returns total count across configured projects with per-project breakdown.

### Cross-Project Queries

**Find blocked items:**
> "What's blocking right now?"
> "What's blocking?"

Lists all items in Blocked status across all configured projects with optional block reasons.

**Standup summary:**
> "Give me a standup summary"
> "Daily standup"

Aggregates status across all active projects showing:
- Items in progress per project
- Blocked items per project
- Items completed this week per project

### Time-Based Queries

**Weekly summary:**
> "What did I ship this week?"

Shows issues closed since Monday of the current week.

**Today's completions:**
> "What did I ship today?"
> "Today's completions"

Shows issues closed today.

**Last 7 days:**
> "What did I ship in the last 7 days?"
> "Recent completions"

Shows issues closed in the past week.

**Monthly reports:**
> "What did I ship this month?"
> "What did I complete last month?"

Shows issues closed within the specified month.

### Status Updates

**Move to status:**
> "Move the auth refactor to in-progress"
> "Set API docs as done"
> "Mark #12 as in progress"

Updates the project item status field using fuzzy matching to find the task.

**Mark blocked with reason:**
> "Mark the API rate limiting task as blocked - waiting on vendor response"
> "Set PDF extraction as blocked: design review needed"

Sets blocked status and adds reason as a message.

### Comments and Notes

**Add note to task:**
> "Add a note to the database migration task: need to coordinate with DevOps"
> "Comment on #12: Needs design review first"
> "Note to PDF extraction: Started on this today"

Adds a comment to the matching issue using fuzzy title matching.

### Issue Creation

**Create issue:**
> "Create an issue for webhook timeout handling in TicketBridge"

Creates the issue and optionally adds it to the appropriate project board with initial status.

**Create with labels:**
Issues can be created with labels, assignees, and milestones through the programmatic API.

### PR Linking

**Link PR to issue:**
> "Link issue #12 to PR #45"
> "Link task PDF extraction to PR #45"

Creates a manual link by adding a comment referencing the PR.

**Find linked PRs:**
> "What PRs are linked to #12?"
> "Find PRs for authentication task"

Shows all PRs linked to an issue via cross-references, closing keywords, or manual links.

**Suggest PR links:**
> "Suggest PRs for in-progress issues"
> "Suggest PR links"

Uses title and branch name matching to suggest PRs that might relate to open issues.

## Status Field Mapping

The skill maps natural language to GitHub Project status fields:

| Natural Language | GitHub Status |
|-----------------|---------------|
| backlog, not started, to do | Backlog |
| ready, next up, queued, prioritized | Ready |
| in progress, working on, started, active | In Progress |
| blocked, stuck, waiting, on hold | Blocked |
| done, completed, finished, shipped, closed | Done |

### Customizing Status Mappings

If your project uses different status names, configure them:

```yaml
status_field_mapping:
  backlog: "To Do"
  ready: "Up Next"
  in_progress: "In Progress"
  blocked: "Blocked"
  done: "Done"
```

## Fuzzy Matching

The skill uses fuzzy matching for task identification, supporting:

- **Issue numbers:** "#12", "issue 12"
- **Partial titles:** "PDF extraction" matches "Implement PDF extraction feature"
- **Keywords:** "auth" matches "Authentication refactor"

When matches are ambiguous, the skill will ask for clarification with suggestions.

## How It Works

This skill uses:
- **GitHub GraphQL API** (Projects v2) for project queries, field updates, and item management
- **GitHub REST API** for issue creation, comments, and PR operations

When you ask a question, the skill:
1. Parses your natural language query to identify intent
2. Identifies the target project(s) from your configuration
3. Executes the appropriate API calls (GraphQL and/or REST)
4. Formats the response conversationally

### API Selection

| Operation | API | Reason |
|-----------|-----|--------|
| Query project items | GraphQL | Efficient nested data fetching |
| Get field definitions | GraphQL | Only available via GraphQL |
| Update item status | GraphQL | Projects v2 mutations |
| Create issue | REST | Simpler, well-documented |
| Add comment | REST | Simpler, well-documented |
| List closed issues | REST | Better date filtering |
| Link PR to issue | REST | Comment creation |

## Troubleshooting

**"Project not found"**
- Verify the project number in your configuration matches the URL
- Ensure your token has `project` scope
- For org projects, ensure `read:org` scope is granted

**"Permission denied"**
- Check token scopes include `repo`, `project`, and `read:org`
- For organization projects, ensure you have access to the org

**"Rate limited"**
- GitHub API has rate limits; wait a few minutes and retry
- GraphQL: 5,000 points per hour
- REST: 5,000 requests per hour (authenticated)
- Consider using a GitHub App for higher limits

**"Item not found"**
- The fuzzy matcher couldn't find a close enough match
- Try using more of the title or the issue number (#12)
- Check suggestions provided in the error message

**"Ambiguous match"**
- Multiple items matched your query with similar scores
- Use more specific terms or the issue number

## References

- [config-example.md](references/config-example.md) - Full configuration schema with examples
- [graphql-queries.md](references/graphql-queries.md) - GraphQL query reference
- [field-mappings.md](references/field-mappings.md) - Status field mappings
- [api-patterns.md](references/api-patterns.md) - API interaction patterns
