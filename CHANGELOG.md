# Changelog

All notable changes to the "Azure DevOps Integration" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Work items auto-appended to PR description**: when creating a pull request, selected work items are automatically added as `#workItemId` references at the bottom of the PR description template. Azure DevOps auto-links these references, making it easy to trace PRs back to work items directly from the description.

## [0.3.0] - 2026-03-12

### Added

- **Background notifications for new PR comments**: automatically notifies when new unresolved comments appear on your pull requests, even when the sidebar panel is closed or VS Code is minimized. Tracks unresolved comment counts across polling cycles and shows native notifications when counts increase.
  - Single PR: "New unresolved comments on PR #42: Fix auth flow"
  - Multiple PRs: "New unresolved comments on 3 pull requests"
- **Full comment viewing for general PR comments**: clicking a general PR comment (or any reply) in the Discussion tree now opens the full thread as a read-only markdown document in the editor. Previously, long comments were truncated with ellipsis in the tree view with no way to view the complete text.

### Changed

- **Faster default polling interval**: reduced from 300 seconds (5 minutes) to 60 seconds (1 minute) for more responsive notifications. Configurable via `azureDevops.pullRequestRefreshInterval` (minimum 30 seconds).

### Fixed

- Fixed pull request template not working on Windows due to drive letter casing mismatch between `os.tmpdir()` and VS Code's URI normalization

## [0.2.2] - 2026-03-10

### Added

- **Full comment support**

## [0.2.1] - 2026-03-10

### Added

- **Auto-complete on PR creation**: new setting `azureDevops.pullRequestAutoComplete` enables auto-complete on newly created pull requests. Configure merge strategy (`azureDevops.pullRequestMergeStrategy`), source branch deletion (`azureDevops.pullRequestDeleteSourceBranch`), and work item completion (`azureDevops.pullRequestCompleteWorkItems`). Skipped for draft PRs.
- **Add Comment on Line** command for posting inline comments on PR diffs from the editor
- **Configurable linked work item state on PR creation**: new setting `azureDevops.pullRequestLinkedWorkItemState` lets you specify a state (e.g. `To verify`) to automatically apply to the linked work item when creating a pull request. Leave empty to disable the transition.
- **Pull request template support**: automatically detects PR templates (`.azuredevops/pull_request_template.md` and common variants) and opens them in an editor tab when creating a PR. Edit the description and close the tab to submit, or clear all text to skip — no save prompts, similar to git commit messages.
- **Work item picker during PR creation**: new setting `azureDevops.showAssignedWorkItems` (enabled by default) displays a multi-select picker of work items assigned to you when creating a pull request, allowing you to easily link multiple work items to the PR. Work items detected from the branch name are pre-selected.

### Fixed

- Remote URLs with percent-encoded characters (e.g. spaces as `%20`) in the organization, project, or repository name were being double-encoded to `%2520` when constructing Azure DevOps URLs
- Fixed work item state update failing with HTTP 400 after PR creation due to incorrect `Content-Type` header (`application/json` instead of `application/json-patch+json`)
- "Creating pull request..." progress notification no longer stays busy after the PR is created

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
