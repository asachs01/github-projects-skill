# API Interaction Patterns

This document describes common patterns for interacting with the GitHub API for project management.

## API Selection: GraphQL vs REST

| Operation | API | Reason |
|-----------|-----|--------|
| Query project items | GraphQL | Efficient nested data fetching |
| Get field definitions | GraphQL | Only available via GraphQL |
| Update item status | GraphQL | Projects v2 mutations |
| Create issue | REST | Simpler, well-documented |
| Add comment | REST | Simpler, well-documented |
| List closed issues | REST | Better date filtering |
| Create milestone | REST | Only available via REST |

## Authentication

### Token Setup

```typescript
const headers = {
  'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
  'Content-Type': 'application/json',
};
```

### Verify Token Scopes

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.github.com/user \
  -I | grep x-oauth-scopes
```

Expected: `x-oauth-scopes: repo, project, read:org`

## Rate Limiting

### GraphQL Limits

- 5,000 points per hour
- Each query has a calculated cost
- Check remaining via response headers

### REST Limits

- 5,000 requests per hour (authenticated)
- Check via `X-RateLimit-Remaining` header

### Handling Rate Limits

```typescript
async function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error.status === 403 && error.message.includes('rate limit')) {
      const resetTime = error.headers['x-ratelimit-reset'];
      const waitMs = (resetTime * 1000) - Date.now();
      await sleep(Math.min(waitMs, 60000)); // Wait up to 1 minute
      return fn(); // Retry once
    }
    throw error;
  }
}
```

## Common Patterns

### 1. Initialize Project Context

On first query for a project:

```typescript
async function initializeProject(config: ProjectConfig) {
  // 1. Get project node ID
  const project = await getProjectByNumber(config.org, config.projectNumber);

  // 2. Get field definitions (especially Status)
  const fields = await getProjectFields(project.id);
  const statusField = fields.find(f => f.name === 'Status');

  // 3. Cache field IDs and option IDs
  cache.set(`project:${config.name}`, {
    projectId: project.id,
    statusFieldId: statusField.id,
    statusOptions: statusField.options,
  });
}
```

### 2. Query Items by Status

```typescript
async function getItemsByStatus(projectName: string, status: string) {
  const ctx = cache.get(`project:${projectName}`);
  const items = await queryProjectItems(ctx.projectId);

  return items.filter(item => {
    const statusValue = item.fieldValues.find(f => f.field.name === 'Status');
    return statusValue?.name === ctx.statusOptions[status];
  });
}
```

### 3. Create Issue and Add to Project

```typescript
async function createAndAddIssue(
  projectName: string,
  title: string,
  body: string,
  labels: string[]
) {
  const config = getProjectConfig(projectName);
  const ctx = cache.get(`project:${projectName}`);

  // 1. Create issue via REST
  const issue = await createIssue(config.repo, {
    title,
    body,
    labels,
  });

  // 2. Add to project via GraphQL
  const item = await addItemToProject(ctx.projectId, issue.node_id);

  // 3. Set initial status
  await updateItemStatus(
    ctx.projectId,
    item.id,
    ctx.statusFieldId,
    ctx.statusOptions['ready']
  );

  return issue;
}
```

### 4. Update Item Status

```typescript
async function updateStatus(
  projectName: string,
  issueIdentifier: string, // Title or #number
  newStatus: string
) {
  const ctx = cache.get(`project:${projectName}`);

  // 1. Find the item
  const items = await queryProjectItems(ctx.projectId);
  const item = items.find(i =>
    i.content.title.includes(issueIdentifier) ||
    `#${i.content.number}` === issueIdentifier
  );

  // 2. Get the option ID for the new status
  const optionId = ctx.statusOptions.find(o =>
    o.name.toLowerCase() === newStatus.toLowerCase()
  )?.id;

  // 3. Update the field
  await updateProjectItemField(
    ctx.projectId,
    item.id,
    ctx.statusFieldId,
    { singleSelectOptionId: optionId }
  );
}
```

### 5. Aggregate Across Projects

```typescript
async function getBlockedAcrossProjects() {
  const results = await Promise.all(
    getAllProjects().map(async (project) => {
      const blocked = await getItemsByStatus(project.name, 'blocked');
      return blocked.map(item => ({
        project: project.name,
        ...item,
      }));
    })
  );

  return results.flat();
}
```

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| 401 Unauthorized | Invalid token | Check token, regenerate if needed |
| 403 Forbidden | Missing scope | Add required scopes to token |
| 404 Not Found | Wrong project number | Verify project exists and is accessible |
| 422 Unprocessable | Invalid field value | Check field/option IDs are current |

### Retry Strategy

```typescript
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: Error;

  for (const delay of RETRY_DELAYS) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error)) throw error;
      await sleep(delay);
    }
  }

  throw lastError;
}

function isRetryable(error: any): boolean {
  return error.status === 502 ||
         error.status === 503 ||
         error.message.includes('rate limit');
}
```

## Caching Strategy

| Data | TTL | Invalidation |
|------|-----|--------------|
| Project ID | 24h | Manual refresh |
| Field definitions | 1h | On 422 error |
| Status options | 1h | On 422 error |
| Item list | 5min | After mutations |
