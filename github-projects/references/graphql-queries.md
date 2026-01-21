# GraphQL Queries Reference

This document contains the GraphQL queries used for interacting with GitHub Projects v2. All queries match the implementation in `src/github/queries.ts`.

## Table of Contents

- [Authentication](#authentication)
- [Queries](#queries)
  - [GET_USER_PROJECTS](#get_user_projects)
  - [GET_ORG_PROJECTS](#get_org_projects)
  - [GET_USER_PROJECT](#get_user_project)
  - [GET_ORG_PROJECT](#get_org_project)
  - [GET_PROJECT_ITEMS](#get_project_items)
  - [GET_PROJECT_FIELDS](#get_project_fields)
- [Mutations](#mutations)
  - [ADD_PROJECT_ITEM](#add_project_item)
  - [UPDATE_PROJECT_ITEM_FIELD](#update_project_item_field)
- [Pagination Patterns](#pagination-patterns)
- [Status Field Mapping](#status-field-mapping)
- [Notes](#notes)

## Authentication

All queries require a GitHub token with `project` scope in the Authorization header:

```
Authorization: Bearer YOUR_GITHUB_TOKEN
```

Required scopes:
- `read:project` - For reading project data
- `project` - For full read/write access (required for mutations)

---

## Queries

### GET_USER_PROJECTS

List all projects for a user.

```graphql
query GetUserProjects($login: String!, $first: Int = 20) {
  user(login: $login) {
    projectsV2(first: $first) {
      nodes {
        id
        title
        number
        url
        closed
      }
    }
  }
}
```

**Variables:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `login` | String | Yes | - | GitHub username |
| `first` | Int | No | 20 | Number of projects to return |

**Example Response:**
```json
{
  "data": {
    "user": {
      "projectsV2": {
        "nodes": [
          {
            "id": "PVT_kwHOAA22Q84BNKgT",
            "title": "My Project Board",
            "number": 1,
            "url": "https://github.com/users/username/projects/1",
            "closed": false
          }
        ]
      }
    }
  }
}
```

---

### GET_ORG_PROJECTS

List all projects for an organization.

```graphql
query GetOrgProjects($login: String!, $first: Int = 20) {
  organization(login: $login) {
    projectsV2(first: $first) {
      nodes {
        id
        title
        number
        url
        closed
      }
    }
  }
}
```

**Variables:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `login` | String | Yes | - | Organization name |
| `first` | Int | No | 20 | Number of projects to return |

**Example Response:**
```json
{
  "data": {
    "organization": {
      "projectsV2": {
        "nodes": [
          {
            "id": "PVT_kwDOBorg123",
            "title": "Team Sprint Board",
            "number": 5,
            "url": "https://github.com/orgs/orgname/projects/5",
            "closed": false
          }
        ]
      }
    }
  }
}
```

---

### GET_USER_PROJECT

Fetch a specific project by number for a user, including field definitions.

```graphql
query GetUserProject($login: String!, $number: Int!) {
  user(login: $login) {
    projectV2(number: $number) {
      id
      title
      number
      url
      closed
      fields(first: 20) {
        nodes {
          ... on ProjectV2Field {
            id
            name
            dataType
          }
          ... on ProjectV2SingleSelectField {
            id
            name
            options {
              id
              name
            }
          }
          ... on ProjectV2IterationField {
            id
            name
          }
        }
      }
    }
  }
}
```

**Variables:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `login` | String | Yes | GitHub username |
| `number` | Int | Yes | Project number |

**Example Response:**
```json
{
  "data": {
    "user": {
      "projectV2": {
        "id": "PVT_kwHOAA22Q84BNKgT",
        "title": "My Project Board",
        "number": 1,
        "url": "https://github.com/users/username/projects/1",
        "closed": false,
        "fields": {
          "nodes": [
            {
              "id": "PVTF_lAHOAA22Q84BNKgTzgNxYbc",
              "name": "Title",
              "dataType": "TITLE"
            },
            {
              "id": "PVTSSF_lAHOAA22Q84BNKgTzgNxYbg",
              "name": "Status",
              "options": [
                { "id": "f75ad846", "name": "Todo" },
                { "id": "47fc9ee4", "name": "In Progress" },
                { "id": "98236657", "name": "Done" }
              ]
            },
            {
              "id": "PVTIF_lAHOAA22Q84BNKgTzgNxYbi",
              "name": "Sprint"
            }
          ]
        }
      }
    }
  }
}
```

---

### GET_ORG_PROJECT

Fetch a specific project by number for an organization, including field definitions.

```graphql
query GetOrgProject($login: String!, $number: Int!) {
  organization(login: $login) {
    projectV2(number: $number) {
      id
      title
      number
      url
      closed
      fields(first: 20) {
        nodes {
          ... on ProjectV2Field {
            id
            name
            dataType
          }
          ... on ProjectV2SingleSelectField {
            id
            name
            options {
              id
              name
            }
          }
          ... on ProjectV2IterationField {
            id
            name
          }
        }
      }
    }
  }
}
```

**Variables:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `login` | String | Yes | Organization name |
| `number` | Int | Yes | Project number |

**Example Response:**
```json
{
  "data": {
    "organization": {
      "projectV2": {
        "id": "PVT_kwDOBorg123",
        "title": "Team Sprint Board",
        "number": 5,
        "url": "https://github.com/orgs/orgname/projects/5",
        "closed": false,
        "fields": {
          "nodes": [
            {
              "id": "PVTF_org_title",
              "name": "Title",
              "dataType": "TITLE"
            },
            {
              "id": "PVTSSF_org_status",
              "name": "Status",
              "options": [
                { "id": "opt_backlog", "name": "Backlog" },
                { "id": "opt_inprog", "name": "In Progress" },
                { "id": "opt_review", "name": "In Review" },
                { "id": "opt_done", "name": "Done" }
              ]
            }
          ]
        }
      }
    }
  }
}
```

---

### GET_PROJECT_ITEMS

Fetch all items in a project with pagination support. Returns issues and pull requests with their field values.

```graphql
query GetProjectItems($projectId: ID!, $first: Int = 100, $after: String) {
  node(id: $projectId) {
    ... on ProjectV2 {
      items(first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          fieldValues(first: 10) {
            nodes {
              ... on ProjectV2ItemFieldTextValue {
                text
                field {
                  ... on ProjectV2FieldCommon {
                    name
                  }
                }
              }
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                optionId
                field {
                  ... on ProjectV2FieldCommon {
                    name
                  }
                }
              }
              ... on ProjectV2ItemFieldDateValue {
                date
                field {
                  ... on ProjectV2FieldCommon {
                    name
                  }
                }
              }
            }
          }
          content {
            ... on Issue {
              id
              number
              title
              url
              state
              labels(first: 10) {
                nodes {
                  name
                }
              }
              assignees(first: 5) {
                nodes {
                  login
                }
              }
              updatedAt
              closedAt
            }
            ... on PullRequest {
              id
              number
              title
              url
              state
              updatedAt
              closedAt
            }
          }
        }
      }
    }
  }
}
```

**Variables:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `projectId` | ID | Yes | - | Global node ID of the project |
| `first` | Int | No | 100 | Number of items per page |
| `after` | String | No | null | Cursor for pagination |

**Example Response:**
```json
{
  "data": {
    "node": {
      "items": {
        "pageInfo": {
          "hasNextPage": true,
          "endCursor": "Y3Vyc29yOnYyOpHOABcdef"
        },
        "nodes": [
          {
            "id": "PVTI_lAHOAA22Q84BNKgTzgJxYbc",
            "fieldValues": {
              "nodes": [
                {
                  "name": "In Progress",
                  "optionId": "47fc9ee4",
                  "field": { "name": "Status" }
                },
                {
                  "date": "2024-01-15",
                  "field": { "name": "Due Date" }
                }
              ]
            },
            "content": {
              "id": "I_kwDOHxyz123",
              "number": 42,
              "title": "Implement user authentication",
              "url": "https://github.com/owner/repo/issues/42",
              "state": "OPEN",
              "labels": {
                "nodes": [
                  { "name": "enhancement" },
                  { "name": "priority-high" }
                ]
              },
              "assignees": {
                "nodes": [
                  { "login": "developer1" }
                ]
              },
              "updatedAt": "2024-01-10T15:30:00Z",
              "closedAt": null
            }
          }
        ]
      }
    }
  }
}
```

---

### GET_PROJECT_FIELDS

Get field definitions for a project by its node ID. Use this when you already have the project ID and need to look up field/option IDs for updates.

```graphql
query GetProjectFields($projectId: ID!) {
  node(id: $projectId) {
    ... on ProjectV2 {
      fields(first: 20) {
        nodes {
          ... on ProjectV2Field {
            id
            name
            dataType
          }
          ... on ProjectV2SingleSelectField {
            id
            name
            options {
              id
              name
            }
          }
        }
      }
    }
  }
}
```

**Variables:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `projectId` | ID | Yes | Global node ID of the project |

**Example Response:**
```json
{
  "data": {
    "node": {
      "fields": {
        "nodes": [
          {
            "id": "PVTF_lAHOAA22Q84BNKgTzgNxYbc",
            "name": "Title",
            "dataType": "TITLE"
          },
          {
            "id": "PVTSSF_lAHOAA22Q84BNKgTzgNxYbg",
            "name": "Status",
            "options": [
              { "id": "f75ad846", "name": "Todo" },
              { "id": "47fc9ee4", "name": "In Progress" },
              { "id": "98236657", "name": "Done" }
            ]
          },
          {
            "id": "PVTF_lAHOAA22Q84BNKgTzgNxYbd",
            "name": "Assignees",
            "dataType": "ASSIGNEES"
          }
        ]
      }
    }
  }
}
```

**Note:** This query does not include `ProjectV2IterationField` fragments unlike the `GET_USER_PROJECT` and `GET_ORG_PROJECT` queries. If you need iteration field data, use those queries instead.

---

## Mutations

### ADD_PROJECT_ITEM

Add an existing issue or pull request to a project.

```graphql
mutation AddProjectItem($projectId: ID!, $contentId: ID!) {
  addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
    item {
      id
    }
  }
}
```

**Variables:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `projectId` | ID | Yes | Global node ID of the project |
| `contentId` | ID | Yes | Global node ID of the issue or PR |

**Example Response:**
```json
{
  "data": {
    "addProjectV2ItemById": {
      "item": {
        "id": "PVTI_lAHOAA22Q84BNKgTzgJxYbc"
      }
    }
  }
}
```

---

### UPDATE_PROJECT_ITEM_FIELD

Update a single-select field value (e.g., change the Status of an item).

```graphql
mutation UpdateProjectItemField(
  $projectId: ID!
  $itemId: ID!
  $fieldId: ID!
  $singleSelectOptionId: ID!
) {
  updateProjectV2ItemFieldValue(
    input: {
      projectId: $projectId
      itemId: $itemId
      fieldId: $fieldId
      value: { singleSelectOptionId: $singleSelectOptionId }
    }
  ) {
    projectV2Item {
      id
    }
  }
}
```

**Variables:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `projectId` | ID | Yes | Global node ID of the project |
| `itemId` | ID | Yes | Global node ID of the project item |
| `fieldId` | ID | Yes | Global node ID of the field to update |
| `singleSelectOptionId` | ID | Yes | Global node ID of the option to set |

**Example Response:**
```json
{
  "data": {
    "updateProjectV2ItemFieldValue": {
      "projectV2Item": {
        "id": "PVTI_lAHOAA22Q84BNKgTzgJxYbc"
      }
    }
  }
}
```

---

## Pagination Patterns

The `GET_PROJECT_ITEMS` query supports cursor-based pagination for handling projects with many items.

### How Pagination Works

1. **Initial Request:** Call without `after` parameter to get first page
2. **Check for More:** Examine `pageInfo.hasNextPage` in response
3. **Get Next Page:** Use `pageInfo.endCursor` as `after` parameter
4. **Repeat:** Continue until `hasNextPage` is `false`

### Example Pagination Flow

```typescript
async function getAllProjectItems(projectId: string) {
  const allItems = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const response = await client.request(GET_PROJECT_ITEMS, {
      projectId,
      first: 100,
      after: cursor
    });

    const { items } = response.node;
    allItems.push(...items.nodes);

    hasNextPage = items.pageInfo.hasNextPage;
    cursor = items.pageInfo.endCursor;
  }

  return allItems;
}
```

### Pagination Best Practices

- Use `first: 100` for efficient batching (maximum allowed by GitHub)
- Implement exponential backoff for rate limit handling
- Cache results when appropriate to reduce API calls
- Consider using pagination only when needed (small projects may fit in one request)

---

## Status Field Mapping

GitHub Projects v2 uses the "Status" field as a single-select field to track item progress. Understanding how to work with status values is essential.

### Finding the Status Field

The Status field is a `ProjectV2SingleSelectField` type. To find it:

1. Query project fields using `GET_USER_PROJECT`, `GET_ORG_PROJECT`, or `GET_PROJECT_FIELDS`
2. Look for a field with `name: "Status"`
3. Store the field `id` and its `options` array

### Common Status Options

While status options are configurable per project, common defaults include:

| Option Name | Typical Use |
|-------------|-------------|
| Todo | Not yet started |
| In Progress | Currently being worked on |
| Done | Completed |
| Backlog | Deprioritized items |
| In Review | Awaiting review/approval |

### Updating Item Status

To change an item's status:

1. Get the Status field ID from project fields
2. Get the option ID for the desired status
3. Get the project item ID (from `GET_PROJECT_ITEMS`)
4. Call `UPDATE_PROJECT_ITEM_FIELD` with all IDs

```typescript
// Example: Move item to "Done" status
const variables = {
  projectId: "PVT_kwHOAA22Q84BNKgT",
  itemId: "PVTI_lAHOAA22Q84BNKgTzgJxYbc",
  fieldId: "PVTSSF_lAHOAA22Q84BNKgTzgNxYbg",  // Status field
  singleSelectOptionId: "98236657"             // "Done" option
};
```

### Reading Item Status

When fetching items with `GET_PROJECT_ITEMS`, status is returned as:

```json
{
  "name": "In Progress",      // Human-readable status name
  "optionId": "47fc9ee4",     // Option ID for comparisons/updates
  "field": { "name": "Status" }
}
```

Use `optionId` for filtering and comparisons; use `name` for display purposes.

---

## Notes

### ID Formats

- **Project IDs:** Global node IDs prefixed with `PVT_` (e.g., `PVT_kwHOAA22Q84BNKgT`)
- **Field IDs:** Prefixed based on type:
  - `PVTF_` - Standard fields (text, number, date)
  - `PVTSSF_` - Single-select fields (like Status)
  - `PVTIF_` - Iteration fields
- **Item IDs:** Prefixed with `PVTI_` (e.g., `PVTI_lAHOAA22Q84BNKgTzgJxYbc`)
- **Issue/PR IDs:** Prefixed with `I_` or `PR_` respectively

### Rate Limiting

- GraphQL API has separate rate limits from REST API
- Default: 5,000 points per hour
- Complex queries cost more points
- Monitor `X-RateLimit-*` headers in responses

### Caching Recommendations

- **Project fields:** Cache for the session (rarely change)
- **Project list:** Cache with short TTL (1-5 minutes)
- **Project items:** Consider real-time or short cache based on use case

### Field Types Reference

| Type | Description | Fragment |
|------|-------------|----------|
| `ProjectV2Field` | Basic fields (text, number, date) | `dataType` indicates subtype |
| `ProjectV2SingleSelectField` | Dropdown with options (Status, Priority) | Has `options` array |
| `ProjectV2IterationField` | Sprint/iteration tracking | Has iteration configuration |

### Common dataType Values

For `ProjectV2Field` types:
- `TITLE` - Item title (read-only from issue/PR)
- `TEXT` - Custom text field
- `NUMBER` - Numeric field
- `DATE` - Date picker field
- `ASSIGNEES` - Linked to assignees (read-only)
- `LABELS` - Linked to labels (read-only)
- `REPOSITORY` - Repository reference (read-only)
