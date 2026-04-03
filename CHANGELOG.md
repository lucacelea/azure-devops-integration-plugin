# Changelog

All notable changes to the "Azure DevOps Integration" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Linked work items in the PR sidebar**: pull requests now show a `Work Items` child node listing linked items with their type and state, and clicking an item opens it in Azure DevOps.
- **Unified discussion tree in `PR Changes`**: file-level threads now appear directly under the changed file they belong to, and general PR comments are grouped under a `General Comments` node in the same view.
- **Thread status actions in `PR Changes`**: discussion threads in the unified review tree can now be resolved, reactivated, or marked as `Won't Fix` / `By Design` from the context menu.
- **Vote from diff editor**: approve, reject, and wait-for-author buttons now appear in the editor title bar when viewing a PR diff, so you can vote without switching back to the sidebar.
- **Multi-root workspace support for PR creation**: when multiple workspace folders are open, a repository picker now appears (similar to VS Code's native "Create Branch" command) showing each repo name and current branch. If only one folder has an Azure DevOps remote, the picker is skipped automatically.

### Changed

- **PR sidebar summaries are more compact**: each pull request now shows relative age in the row description, while branch name, policy checks, and linked work items move into expandable child nodes.
- **Comment navigation now targets the unified `PR Changes` view**: notification actions and comment-opening commands reuse the same review tree instead of switching between separate changes and discussion panels.

### Removed

- **Separate `PR Discussion` view**: discussion threads are now part of `PR Changes`, so the dedicated discussion tree and its refresh/clear actions were removed.

## [0.7.0] - 2026-03-27

### Added

- **Configurable notification scope**: new `azureDevops.notificationScope` setting controls which pull requests trigger comment notifications. Set to `"participating"` to limit notifications to PRs you created or are assigned to, or `"off"` to silence all notifications. Defaults to `"all"` (current behaviour).
- **Remote branch check before PR creation**: when creating a pull request, the extension now checks whether the current branch has been pushed to `origin`. If it hasn't, you are offered a "Push & Continue" option that pushes the branch before proceeding, or "Cancel" to exit — instead of discovering the problem after filling out all the PR fields.
- **Cancel PR creation from the description editor**: after closing the description editor, a confirmation dialog now appears before the pull request is submitted. Choosing "Cancel" exits the flow cleanly without creating anything.

### Fixed

- **PR description editor always opens**: when creating a pull request with no repository template and no work items selected, the description editor now always opens instead of silently skipping the step. You can still close the tab with an empty file to submit with no description.
- **Self-authored comments no longer trigger notifications**: comment notifications are now suppressed when the latest comment in a thread was written by the current user, eliminating noise from your own replies and new threads.

### Removed

- **Removed `azureDevops.enableNotifications` setting**: notification control is now unified under `azureDevops.notificationScope`. Set `notificationScope` to `"off"` to disable all notifications.

## [0.6.0] - 2026-03-22

### Added

- **Actionable PR comment notifications**: notifications for newly detected PR comment activity now offer `Open Comment` and `Open in DevOps` actions when a single new discussion event is detected.
  - `Open Comment` opens the relevant discussion target in VS Code: file comments open the diff at the commented line, and general comments open the full thread view.
  - `Open in DevOps` now targets the PR discussion URL shape with a thread-specific link when available, falling back to the PR page.
- **Edit existing PR descriptions**: you can now update the description of an existing pull request from VS Code.
  - Use the pull request context menu to edit the currently selected PR.
  - Use `Azure DevOps: Edit Pull Request Description` from the command palette to pick one of your authored PRs first.
  - The editor flow reuses the temporary markdown tab pattern used during PR creation, and clearing the file removes the PR description.

### Changed

- **Comment notification detection is now thread-aware**: notifications now track new discussion threads and replies using thread/comment identity instead of only comparing unresolved comment counts.
- **Multiple simultaneous comment events now use a summary notification**: when more than one new discussion event is detected in a single refresh cycle, the extension shows a summary notification instead of a single-target action.
- **PR title suggestions now honor `azureDevops.branchPrefix`**: when creating a pull request, the default title now strips the configured personal branch prefix before applying the existing title normalization.
- **PR description editing command naming is now split by context**: the context menu keeps a short `Edit Description` action, while the command palette uses `Azure DevOps: Edit Pull Request Description`.

## [0.5.0] - 2026-03-18

### Added

- **"Copy URL" for pull requests**: a "Copy URL" action is now shown after PR creation. By default, it copies a plain URL to the clipboard.
  - Set `azureDevops.richCopyUrl` to `true` to copy a rich-text hyperlink instead (e.g. "Pull Request 33416: Export identity"), so that pasting into rich-text editors like Azure DevOps, Teams, or Outlook produces a clickable link followed by the title — matching Azure DevOps' native format.
- **Auto-open PR in browser**: new `azureDevops.pullRequestAutoOpenInBrowser` setting to automatically open the pull request in the browser after creation, removing the need to click "Open in Browser" each time.

## [0.4.0] - 2026-03-17

### Added

- **Work item titles auto-appended to PR description**: when creating a pull request, selected work item titles are automatically appended at the bottom of the PR description template, giving reviewers quick context about related work.
- **Notifications can now be toggled on or off**: in the configuration, you can now enable or disable notifications for new PR comments.

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
