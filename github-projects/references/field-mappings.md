# Status Field Mappings

This document describes how natural language status terms map to GitHub Project field values.

## Default Status Mapping

| Internal Key | GitHub Status | Natural Language Triggers |
|-------------|---------------|---------------------------|
| `backlog` | Backlog | "backlog", "not started", "to do" |
| `ready` | Ready | "ready", "next up", "queued", "prioritized" |
| `in_progress` | In Progress | "in progress", "working on", "started", "active" |
| `blocked` | Blocked | "blocked", "stuck", "waiting", "on hold" |
| `done` | Done | "done", "completed", "finished", "shipped", "closed" |

## Customizing Mappings

If your project uses different status names, update the `status_field_mapping` in your configuration:

```yaml
status_field_mapping:
  backlog: "To Do"           # Your project's backlog column name
  ready: "Up Next"           # Your project's ready column name
  in_progress: "In Progress" # Your project's active work column
  blocked: "Blocked"         # Your project's blocked column
  done: "Done"               # Your project's completed column
```

## Status Field ID Resolution

When the skill loads, it:

1. Queries the project's field definitions
2. Finds the "Status" field (or custom name)
3. Maps each option name to its ID
4. Caches this mapping for subsequent operations

Example field definition response:

```json
{
  "id": "PVTSSF_lADOAA22Q84BNKgTzgXXXXX",
  "name": "Status",
  "options": [
    { "id": "xxxxxxxx", "name": "Backlog" },
    { "id": "yyyyyyyy", "name": "Ready" },
    { "id": "zzzzzzzz", "name": "In Progress" },
    { "id": "aaaaaaaa", "name": "Blocked" },
    { "id": "bbbbbbbb", "name": "Done" }
  ]
}
```

## Priority Labels

Priority is typically handled via issue labels, not project fields:

| Priority | Label |
|----------|-------|
| High | `priority:high` |
| Medium | `priority:medium` |
| Low | `priority:low` |

Configure label prefixes in your config:

```yaml
labels:
  priority_prefix: "priority:"
```

## Blocked Reason

When marking an item as blocked, the skill can:

1. Set the status to "Blocked"
2. Add a label like `blocked:waiting-on-vendor`
3. Add a comment explaining the block

Example:
> "Mark task #47 as blocked by vendor response"

Results in:
- Status: Blocked
- Label: `blocked:vendor-response`
- Comment: "Blocked: waiting on vendor response"

## Custom Fields

GitHub Projects v2 supports custom fields. Common patterns:

| Field Type | Use Case |
|------------|----------|
| Single select | Status, Priority, Sprint |
| Text | Notes, Blocked Reason |
| Number | Story Points, Complexity |
| Date | Due Date, Target Release |
| Iteration | Sprint planning |

The skill focuses on the Status field by default but can be extended to handle other fields.
