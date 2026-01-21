# GitHub Projects Skill

A conversational interface for managing GitHub Projects with Taskmaster integration. Query project status, create issues, update tasks, and sync Taskmaster tasks to GitHub - all through natural language.

## Features

- **Natural Language Queries**: Ask "what's blocking?" or "what did I ship this week?"
- **Cross-Project Awareness**: Aggregate status across multiple projects
- **Taskmaster Sync**: Automatically sync Taskmaster tasks to GitHub Issues
- **Project Board Integration**: Issues are added to project boards with smart status detection
- **PR Linking**: Link PRs to issues with intelligent suggestions

## Quick Start

### Installation

```bash
npm install
npm run build
```

### Configuration

1. **Set up your GitHub token:**
   ```bash
   export GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
   ```

   Required token scopes: `repo`, `project`, `read:org`

2. **Configure your projects** (create `config.yaml`):
   ```yaml
   projects:
     - name: "MyProject"
       org: "my-username"
       project_number: 1
       repo: "my-username/my-repo"
   ```

### Sync Taskmaster Tasks to GitHub

```bash
# Set required environment variables
export GITHUB_TOKEN="your-token"
export GITHUB_OWNER="your-username-or-org"
export GITHUB_REPO="your-repository"

# Optional: Add to project board
export GITHUB_PROJECT_ID="PVT_kwHOxxxxxx"

# Run sync
npm run sync-tasks

# Or dry run first
DRY_RUN=true npm run sync-tasks
```

### Programmatic Usage

```typescript
import { syncTasks } from 'github-projects-skill/hook';
import { queryBlockedItems, formatBlockedItemsResponse } from 'github-projects-skill/queries';

// Sync Taskmaster tasks to GitHub
const summary = await syncTasks({
  token: process.env.GITHUB_TOKEN,
  owner: 'your-org',
  repo: 'your-repo',
});

// Query blocked items across projects
const blocked = await queryBlockedItems(client, config);
console.log(formatBlockedItemsResponse(blocked));
```

## Documentation

| Document | Description |
|----------|-------------|
| [Skill Documentation](github-projects/SKILL.md) | Complete skill reference with all query patterns |
| [Hook Documentation](docs/README.md) | Taskmaster sync setup and usage |
| [Troubleshooting](docs/troubleshooting.md) | Common issues and solutions |
| [Configuration Example](github-projects/references/config-example.md) | Full configuration schema |
| [API Patterns](github-projects/references/api-patterns.md) | API interaction patterns |
| [GraphQL Queries](github-projects/references/graphql-queries.md) | GraphQL query reference |

## Query Examples

### Status Queries
- "What's the status on [project]?"
- "What's in the backlog?"
- "How many open issues?"

### Cross-Project Queries
- "What's blocking right now?"
- "Give me a standup summary"

### Time-Based Queries
- "What did I ship this week?"
- "What did I complete today?"
- "Show me last month's completions"

### Task Management
- "Move [task] to in-progress"
- "Mark [task] as blocked - waiting on review"
- "Add a note to [task]: [note]"

### Issue Creation
- "Create an issue for [description]"

### PR Linking
- "Link issue #12 to PR #45"
- "What PRs are linked to #12?"
- "Suggest PR links"

## Architecture

```
src/
  github/        # GitHub API client (GraphQL + REST)
  queries/       # Status, aggregated, and time-based queries
  updates/       # Status update service with fuzzy matching
  issues/        # Issue creation service
  comments/      # Comment/note service
  links/         # PR-issue linking service
  hook/          # Taskmaster sync hook
  config/        # Configuration parsing and validation
  types/         # Shared TypeScript types
```

## Development

```bash
# Build
npm run build

# Run tests
npm test

# Watch mode for tests
npm run test:watch

# Clean build artifacts
npm run clean
```

## Requirements

- Node.js 18+
- GitHub Personal Access Token with `repo`, `project`, `read:org` scopes
- (Optional) Taskmaster for task sync functionality

## License

ISC

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request

See [CHANGELOG.md](CHANGELOG.md) for version history.
