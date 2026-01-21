# GraphQL Queries Reference

This document contains the GraphQL queries used for interacting with GitHub Projects v2.

## Authentication

All queries require a GitHub token with `project` scope in the Authorization header:

```
Authorization: Bearer YOUR_GITHUB_TOKEN
```

## Get User Projects

List projects for a user:

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

## Get Organization Projects

List projects for an organization:

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

## Get Project by Number

Fetch a specific project with its fields:

```graphql
query GetProject($login: String!, $number: Int!) {
  user(login: $login) {
    projectV2(number: $number) {
      id
      title
      url
      fields(first: 20) {
        nodes {
          ... on ProjectV2Field {
            id
            name
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

## Get Project Items with Status

Fetch project items with their status values:

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
                field { ... on ProjectV2FieldCommon { name } }
              }
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field { ... on ProjectV2FieldCommon { name } }
              }
              ... on ProjectV2ItemFieldDateValue {
                date
                field { ... on ProjectV2FieldCommon { name } }
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
                nodes { name }
              }
              assignees(first: 5) {
                nodes { login }
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

## Get Project Field Definitions

Get the field IDs needed for updates (especially the Status field):

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

## Add Item to Project

Add an existing issue to a project:

```graphql
mutation AddItemToProject($projectId: ID!, $contentId: ID!) {
  addProjectV2ItemById(input: {
    projectId: $projectId
    contentId: $contentId
  }) {
    item {
      id
    }
  }
}
```

## Update Project Item Field

Change status or other single-select fields:

```graphql
mutation UpdateProjectItemField(
  $projectId: ID!
  $itemId: ID!
  $fieldId: ID!
  $value: ProjectV2FieldValue!
) {
  updateProjectV2ItemFieldValue(input: {
    projectId: $projectId
    itemId: $itemId
    fieldId: $fieldId
    value: $value
  }) {
    projectV2Item {
      id
    }
  }
}
```

**Example value for single-select (Status):**
```json
{
  "singleSelectOptionId": "OPTION_ID_HERE"
}
```

## Get Items by Status

Filter items by their status field value:

```graphql
query GetItemsByStatus($projectId: ID!, $statusFieldId: ID!, $statusOptionId: String!) {
  node(id: $projectId) {
    ... on ProjectV2 {
      items(first: 100) {
        nodes {
          id
          fieldValueByName(name: "Status") {
            ... on ProjectV2ItemFieldSingleSelectValue {
              name
              optionId
            }
          }
          content {
            ... on Issue {
              number
              title
              url
            }
          }
        }
      }
    }
  }
}
```

## Recently Closed Issues (Time-based Query)

For "what did I ship this week" queries, use REST API to filter by closed date, then cross-reference with project:

```graphql
query GetIssueProjectItem($issueId: ID!) {
  node(id: $issueId) {
    ... on Issue {
      projectItems(first: 10) {
        nodes {
          project {
            title
            number
          }
          fieldValueByName(name: "Status") {
            ... on ProjectV2ItemFieldSingleSelectValue {
              name
            }
          }
        }
      }
    }
  }
}
```

## Notes

- Project IDs are global node IDs (e.g., `PVT_kwHOAA22Q84BNKgT`)
- Field IDs and option IDs are also global node IDs
- Always cache field definitions to avoid repeated queries
- Use pagination (`after` cursor) for projects with many items
- The GraphQL API has a rate limit separate from REST
