#!/usr/bin/env bash
set -euo pipefail

# GitHub Projects Skill Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/asachs01/github-projects-skill/main/install.sh | bash

REPO="asachs01/github-projects-skill"
INSTALL_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/github-projects-skill"
SKILL_LINK_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

echo ""
echo "================================================"
echo "  GitHub Projects Skill Installer"
echo "================================================"
echo ""

# Check prerequisites
command -v git >/dev/null 2>&1 || error "git is required but not installed"
command -v npm >/dev/null 2>&1 || error "npm is required but not installed"
command -v node >/dev/null 2>&1 || error "node is required but not installed"

# Check Node version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  error "Node.js 18+ is required (found v$NODE_VERSION)"
fi
success "Node.js v$(node -v | cut -d'v' -f2)"

# Create skills directory if needed
mkdir -p "$SKILL_LINK_DIR"

# Clone or update
if [ -d "$INSTALL_DIR" ]; then
  info "Updating existing installation..."
  cd "$INSTALL_DIR"
  git pull --ff-only origin main
else
  info "Cloning repository..."
  git clone "https://github.com/$REPO.git" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi
success "Repository ready"

# Install dependencies
info "Installing dependencies..."
npm install --silent
success "Dependencies installed"

# Build
info "Building..."
npm run build --silent
success "Build complete"

# Create skill symlink for Claude Code
SKILL_SOURCE="$INSTALL_DIR/github-projects"
if [ -d "$SKILL_SOURCE" ]; then
  ln -sfn "$SKILL_SOURCE" "$SKILL_LINK_DIR/github-projects" 2>/dev/null || true
  success "Skill linked to Claude Code"
fi

# Check for GitHub token
echo ""
if [ -z "${GITHUB_TOKEN:-}" ]; then
  warn "GITHUB_TOKEN not set"
  echo ""
  echo "To complete setup, create a GitHub Personal Access Token with scopes:"
  echo "  - repo"
  echo "  - project"
  echo "  - read:org"
  echo ""
  echo "Then add to your shell profile (~/.bashrc or ~/.zshrc):"
  echo ""
  echo "  export GITHUB_TOKEN=\"ghp_your_token_here\""
  echo ""
else
  success "GITHUB_TOKEN is set"
fi

# Create sample config if none exists
CONFIG_FILE="$INSTALL_DIR/config.yaml"
if [ ! -f "$CONFIG_FILE" ]; then
  cat > "$CONFIG_FILE" << 'YAML'
# GitHub Projects Skill Configuration
# Edit this file with your project details

projects:
  - name: "MyProject"           # Display name for the project
    org: "your-username"        # GitHub username or organization
    project_number: 1           # Project number (from URL: github.com/users/X/projects/N)
    repo: "your-username/repo"  # Primary repository

# Optional: Multiple projects
#  - name: "SecondProject"
#    org: "your-org"
#    project_number: 2
#    repos:
#      - "your-org/repo-1"
#      - "your-org/repo-2"

# Status field mapping (customize if your project uses different column names)
status_field_mapping:
  backlog: "Backlog"
  ready: "Ready"
  in_progress: "In Progress"
  blocked: "Blocked"
  done: "Done"
YAML
  info "Created sample config at: $CONFIG_FILE"
fi

echo ""
echo "================================================"
echo -e "${GREEN}  Installation Complete!${NC}"
echo "================================================"
echo ""
echo "Next steps:"
echo ""
echo "  1. Edit your config:"
echo "     $CONFIG_FILE"
echo ""
echo "  2. Set your GitHub token (if not already set):"
echo "     export GITHUB_TOKEN=\"ghp_...\""
echo ""
echo "  3. Test the skill in Claude Code:"
echo "     \"What's the status on MyProject?\""
echo ""
echo "  4. Sync Taskmaster tasks (optional):"
echo "     cd $INSTALL_DIR"
echo "     GITHUB_OWNER=you GITHUB_REPO=repo npm run sync-tasks"
echo ""
echo "Docs: https://github.com/$REPO#readme"
echo ""
