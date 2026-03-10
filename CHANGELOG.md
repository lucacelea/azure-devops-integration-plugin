# Changelog

All notable changes to the "Azure DevOps Integration" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.1] - 2026-03-10

### Added

- **Add Comment on Line** command for posting inline comments on PR diffs from the editor

### Changed

- Left-clicking a PR in the sidebar now opens the PR changes view instead of the Azure DevOps URL
- "Open in Browser" moved to the first position in the right-click context menu, replacing "Review Changes"
- "Add Comment" command renamed to "Azure DevOps: Add Comment" for consistency with other commands

## [0.2.0] - 2026-03-09

### Added

- **PR review actions** from the sidebar context menu: Approve, Approve with Suggestions, Wait for Author, Reject, and Reset Vote
- **Complete Pull Request** to merge a PR directly from VS Code with confirmation dialog
- **Abandon Pull Request** to close a PR without merging
- **Add Comment** to post a general comment on a PR
- **Checkout Branch** to check out a PR's source branch locally
- **Review Changes** to view files changed in a PR with a dedicated tree view
- **Inline diff view** for PR file changes using a custom `azuredevops-pr://` content provider
- **Filter Pull Requests** by draft, needs my vote, has comments, or checks failing
- **Sort Pull Requests** by title or comment count
- **Open in Browser** context menu action for PRs
- API-based PR creation flow with title auto-suggestion, target branch selection, and draft option
- Support for legacy `visualstudio.com` remote URL format

### Changed

- PR creation now uses the Azure DevOps API instead of opening the browser to the create page

---

## [0.1.0] - 2026-03-08

### Added

- Pull Request sidebar with PRs grouped by "Created by me," "Assigned to me," and "Assigned to my teams"
- Rich PR status indicators: review status, check status, draft indicator, and unresolved comment count
- Auto-detection of Azure DevOps organization, project, and repository from git remote URL
- Work item ID extraction from branch names with status bar display
- **Create Pull Request** command with automatic work item linking
- **Open Repository** command to open the repo in Azure DevOps
- **Open Work Item** command with branch-based ID pre-fill
- PAT-based authentication with secure storage via VS Code SecretStorage
- Configurable auto-refresh interval for the PR list
- Support for custom branch prefixes and work item regex patterns
