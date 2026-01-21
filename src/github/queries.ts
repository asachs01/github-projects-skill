import { gql } from 'graphql-request';

/**
 * GraphQL queries for GitHub Projects v2
 */

// Get projects for a user
export const GET_USER_PROJECTS = gql`
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
`;

// Get projects for an organization
export const GET_ORG_PROJECTS = gql`
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
`;

// Get a specific project by number for a user
export const GET_USER_PROJECT = gql`
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
`;

// Get a specific project by number for an organization
export const GET_ORG_PROJECT = gql`
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
`;

// Get project items with pagination
export const GET_PROJECT_ITEMS = gql`
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
`;

// Add an item (issue/PR) to a project
export const ADD_PROJECT_ITEM = gql`
  mutation AddProjectItem($projectId: ID!, $contentId: ID!) {
    addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
      item {
        id
      }
    }
  }
`;

// Update a project item field (e.g., change status)
export const UPDATE_PROJECT_ITEM_FIELD = gql`
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
`;

// Get project fields by project node ID
export const GET_PROJECT_FIELDS = gql`
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
`;
