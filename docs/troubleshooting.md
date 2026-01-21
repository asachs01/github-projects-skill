# Troubleshooting Guide

This guide covers common issues and their solutions when using the GitHub Projects Skill and Taskmaster Hook.

## Table of Contents

- [Token and Authentication Issues](#token-and-authentication-issues)
- [Project Configuration Issues](#project-configuration-issues)
- [Sync Operation Issues](#sync-operation-issues)
- [Rate Limiting](#rate-limiting)
- [Common Error Messages](#common-error-messages)

## Token and Authentication Issues

### "Authentication failed. Check your GitHub token."

**Cause:** The token is invalid, expired, or malformed.

**Solutions:**
1. Verify your token hasn't expired
2. Regenerate a new token if needed
3. Ensure the token is correctly set in the environment variable
4. Check for extra whitespace or newlines in the token value

```bash
# Verify token is set correctly
echo $GITHUB_TOKEN | head -c 10
# Should show: ghp_xxxxxx (first 10 chars)

# Test token validity
curl -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user
```

### "Access denied. Ensure your token has repo scope."

**Cause:** The token lacks required permission scopes.

**Required Scopes:**
- `repo` - Full repository access (issues, PRs, comments)
- `project` - Read/write access to projects
- `read:org` - Organization project access (for org projects)

**How to Check Token Scopes:**
```bash
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  -I https://api.github.com/user 2>&1 | grep -i x-oauth-scopes
```

**Expected output:** `x-oauth-scopes: repo, project, read:org`

### Fine-Grained Token Permissions

If using a fine-grained token, ensure these repository permissions:
- **Issues:** Read and write
- **Pull requests:** Read and write
- **Projects:** Read and write
- **Contents:** Read (for some operations)

And these account permissions:
- **Organization projects:** Read and write (if using org projects)

## Project Configuration Issues

### Finding Your Project Number

The project number is in the URL when viewing your project:

```
User project:
https://github.com/users/USERNAME/projects/2
                                          ^ project_number = 2

Organization project:
https://github.com/orgs/ORG-NAME/projects/5
                                         ^ project_number = 5
```

### Finding Your Project ID (Node ID)

The project ID is needed for adding items to projects. To find it:

```bash
# For a user project
gh api graphql -f query='
  query {
    user(login: "YOUR_USERNAME") {
      projectV2(number: YOUR_PROJECT_NUMBER) {
        id
      }
    }
  }
'

# For an organization project
gh api graphql -f query='
  query {
    organization(login: "YOUR_ORG") {
      projectV2(number: YOUR_PROJECT_NUMBER) {
        id
      }
    }
  }
'
```

The ID will look like: `PVT_kwHOAA22Q84BNKgT`

### "Project not found"

**Causes:**
1. Wrong project number
2. Project is private and token lacks access
3. Using wrong org/user context

**Solutions:**
1. Verify the project number from the URL
2. Ensure token has `project` scope
3. For organization projects, also need `read:org` scope
4. Check if the project is truly accessible to your account

### "Repository not found or not accessible"

**Causes:**
1. Repository doesn't exist
2. Repository is private and token lacks access
3. Typo in owner/repo name

**Solutions:**
```bash
# Verify repository access
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/repos/OWNER/REPO
```

## Sync Operation Issues

### Tasks Not Being Synced

**Check the sync state file:**
```bash
cat .taskmaster/sync-state.json | jq '.taskMappings | keys'
```

**Verify tasks exist:**
```bash
cat .taskmaster/tasks/tasks.json | jq '.[].id'
```

**Run verification:**
```typescript
import { verifySyncIdempotency } from 'github-projects-skill/hook';

const check = verifySyncIdempotency({});
console.log('Unsynced tasks:', check.unsyncedTaskIds);
```

### Duplicate Issues Created

**Cause:** Sync state was lost or corrupted.

**Prevention:**
1. Don't delete `sync-state.json` unless intentionally resetting
2. Use `useLocking: true` for concurrent access
3. Use `saveAfterEachTask: true` for recovery from partial failures

**Recovery:**
1. Manually update `sync-state.json` with the task-to-issue mappings
2. Or delete duplicate issues and clear the sync state to start fresh

### Lock File Stuck

**Symptom:** "Failed to acquire lock" error

**Cause:** Previous sync crashed while holding the lock.

**Solution:**
```bash
# Remove stale lock file (only if no sync is running)
rm .taskmaster/sync-state.json.lock
```

### "Invalid issue data" (422 Error)

**Causes:**
1. Invalid label names (labels must exist or be created)
2. Invalid assignee (user must have repo access)
3. Invalid milestone (milestone must exist)

**Solutions:**
1. Create labels before syncing if using custom labels
2. Verify assignees have repository access
3. Create milestones before referencing them

## Rate Limiting

### Understanding Rate Limits

**REST API:**
- 5,000 requests per hour (authenticated)
- Check remaining: `X-RateLimit-Remaining` header

**GraphQL API:**
- 5,000 points per hour
- Different queries cost different points
- Check remaining via `rateLimit` field in response

### "Rate limited" Error

**Immediate Solutions:**
1. Wait for the rate limit to reset (check `X-RateLimit-Reset` header)
2. Reduce batch sizes
3. Add delays between operations

**Long-term Solutions:**
1. Use a GitHub App instead of PAT (higher limits)
2. Cache responses where appropriate
3. Batch operations efficiently

**Check your rate limit status:**
```bash
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/rate_limit | jq '.rate'
```

### Optimizing API Usage

1. **Batch project item fetches:** The GraphQL query fetches up to 100 items per request
2. **Cache project context:** Field IDs and status options rarely change
3. **Use dry run first:** Test sync with `DRY_RUN=true` before actual sync

## Common Error Messages

### "Status 'xyz' not found in project"

**Cause:** The status name doesn't match any option in your project.

**Solution:** List available statuses:
```typescript
const projectContext = await client.getProject(org, projectNumber, isOrg);
console.log('Available statuses:', Array.from(projectContext.statusOptions.keys()));
```

Then update your configuration or use the correct status name.

### "Item not found"

**Cause:** Fuzzy matching couldn't find a task matching your query.

**Solutions:**
1. Use more specific search terms
2. Use the issue number directly: `#42`
3. Check the suggestions provided in the error

### "Ambiguous match"

**Cause:** Multiple items matched with similar confidence scores.

**Solutions:**
1. Be more specific in your query
2. Use the issue number directly
3. Use more of the full title

### "Could not parse update request"

**Cause:** The natural language input didn't match expected patterns.

**Expected formats:**
- `move [task] to [status]`
- `set [task] as [status]`
- `mark [task] as [status]`
- `[task] [status]` (simple format)

### GraphQL Errors

**"Field 'projectV2' doesn't exist"**
- Your token may not have project access
- The project might not exist

**"Resource not accessible by integration"**
- Token lacks required permissions
- Check all required scopes are granted

## Getting Help

If you're still stuck:

1. Check the GitHub API documentation: https://docs.github.com/en/graphql
2. Verify your configuration against `references/config-example.md`
3. Review the API patterns in `references/api-patterns.md`
4. Open an issue with:
   - Error message (redact any tokens)
   - Relevant configuration (redact sensitive data)
   - Steps to reproduce
