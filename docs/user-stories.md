# Azure DevOps Integration - User Stories

## Epic 1: Extension Configuration

### US-1.1: Configure Azure DevOps connection manually

**As a** developer,
**I want to** configure my Azure DevOps organization, project, and repository in the extension settings,
**so that** the extension knows which DevOps project to interact with.

**Acceptance Criteria:**

- The extension exposes settings for `organization`, `project`, and `repository name` via VS Code's settings UI.
- Settings can be defined at workspace level (`.vscode/settings.json`) or user level.
- The extension validates that all required fields are filled before executing any command and shows a clear error message if not.

---

### US-1.2: Auto-detect Azure DevOps configuration from git remote

**As a** developer,
**I want to** the extension to automatically detect my organization, project, and repository from the git remote URL,
**so that** I don't have to configure anything manually when the remote is already set.

**Acceptance Criteria:**

- The extension parses the git remote URL. Supported formats:
  - `https://dev.azure.com/{org}/{project}/_git/{repo}`
  - `https://user@dev.azure.com/{org}/{project}/_git/{repo}`
  - `git@ssh.dev.azure.com:v3/{org}/{project}/{repo}`
  - `https://{org}.visualstudio.com/{project}/_git/{repo}` (legacy)
- Auto-detected values are used as defaults when no manual configuration is provided.
- Manual settings take precedence over auto-detected values.
- If auto-detection fails and no manual config exists, the user is prompted to configure the settings.

---

## Epic 2: Quick Actions

### US-2.1: Create a pull request from the current branch

**As a** developer,
**I want to** create a pull request directly from VS Code using an interactive flow,
**so that** I can create a PR without leaving the editor.

**Acceptance Criteria:**

- A command `Azure DevOps: Create Pull Request` is available in the command palette.
- The command prompts for:
  1. **Title** — auto-suggested from the branch name (strips conventional prefixes like `feature/`, `bugfix/`, etc. and prepends the work item ID if detected).
  2. **Target branch** — defaults to the repository's default branch.
  3. **Draft** — Yes/No prompt to mark the PR as a draft.
- The PR is created via the Azure DevOps API (not by opening the browser).
- If a work item ID is detected from the branch (see US-4.1), it is automatically linked to the PR.
- After creation, the user is offered the option to open the new PR in the browser.
- The current branch is determined from the local git repository.
- If the user is on the default branch (e.g., `main`), a warning is shown: "You are on the default branch. Are you sure you want to create a PR from here?"
- A progress notification is shown during creation.

---

### US-2.2: Open the repository in Azure DevOps

**As a** developer,
**I want to** run a command that opens the Azure DevOps repository page in my browser,
**so that** I can quickly navigate to the repository without manually building the URL.

**Acceptance Criteria:**

- A command `Azure DevOps: Open Repository` is available in the command palette.
- The command opens: `https://dev.azure.com/{org}/{project}/_git/{repo}`.

---

### US-2.3: Open a work item by ID

**As a** developer,
**I want to** run a command that prompts me for a work item ID and opens it in Azure DevOps,
**so that** I can quickly jump to any work item without searching for it manually.

**Acceptance Criteria:**

- A command `Azure DevOps: Open Work Item` is available in the command palette.
- The command shows an input box prompting for a work item ID.
- The command opens: `https://dev.azure.com/{org}/{project}/_workitems/edit/{workItemId}`.
- If the current branch contains a work item ID (see US-4.1), that ID is pre-filled in the input box.
- Non-numeric input is rejected with a validation message.

---

## Epic 3: Pull Request Sidebar

### US-3.1: View pull requests in a tree view

**As a** developer,
**I want to** see my pull requests in a sidebar panel within VS Code,
**so that** I can keep track of PRs that need my attention without leaving my editor.

**Acceptance Criteria:**

- A dedicated view container is added to the VS Code Activity Bar with a pull request icon.
- The tree view displays PRs grouped into three categories:
  - **Created by me** — PRs authored by the current user.
  - **Assigned to me** — PRs where the current user is a reviewer.
  - **Assigned to my teams** — PRs assigned to teams the user belongs to.
- Each category shows an item count.
- When PRs span multiple repositories, they are auto-nested by repository within each category.
- Each PR entry shows: title, source branch, author, reviewer names, and rich status indicators:
  - Draft indicator
  - Review status (Approved / Waiting / Rejected) with colored icons
  - Check status (Passed / Failed / Running)
  - Unresolved comment count
- PR items display a detailed markdown tooltip with reviewer names and vote status symbols (✓ approved, ✗ rejected, ◯ waiting, – no vote).
- A Personal Access Token (PAT) is required for API access.
- The list refreshes automatically on a configurable interval (default: 5 minutes, minimum: 30 seconds).
- A manual refresh button is available in the tree view header.
- A manual refresh command `Azure DevOps: Refresh Pull Requests` is also available.

---

### US-3.2: Open a pull request from the sidebar

**As a** developer,
**I want to** click on a pull request in the sidebar to open its changes in VS Code,
**so that** I can quickly review and act on it without leaving the editor.

**Acceptance Criteria:**

- Clicking a PR item in the tree view opens the PR changes view in VS Code.
- A context menu action is available to open the PR page in the browser: `https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{prId}`.
- The browser URL uses the correct repository for the PR (which may differ from the currently open repo).

---

## Epic 4: Work Item & Branch Integration

### US-4.1: Auto-detect work item ID from branch name

**As a** developer,
**I want to** the extension to automatically detect a work item ID from my current branch name,
**so that** related features can use it without me having to type it manually.

**Acceptance Criteria:**

- The extension parses the current branch name looking for a numeric work item ID.
- Common branch naming patterns are supported:
  - `feature/1234-description`
  - `bugfix/1234-description`
  - `1234-description`
  - `feature/AB#1234-description`
- The detected work item ID is stored internally and made available to other features (US-2.3, US-4.2).
- The pattern for extracting work item IDs is configurable via settings for teams with custom conventions.
- Let's also support a configurable prefix (I often prefix with `lucac/`)

---

### US-4.2: Show work item ID in the status bar

**As a** developer,
**I want to** see the detected work item ID in the VS Code status bar,
**so that** I always know which work item my current branch is associated with.

**Acceptance Criteria:**

- A status bar item displays the detected work item ID (e.g., `WI #1234`).
- If no work item ID is detected, the status bar item is hidden or shows "No work item".
- Clicking the status bar item opens the work item in Azure DevOps (same behavior as US-2.3).
- The status bar item updates when the user switches branches.

---

### US-4.3: Auto-link work item when creating a pull request

**As a** developer,
**I want to** the detected work item ID to be automatically linked when I create a pull request,
**so that** the PR is associated with the correct work item without extra manual steps.

**Acceptance Criteria:**

- When a work item ID is detected from the branch name (US-4.1), the "Create Pull Request" command (US-2.1) includes it as a work item reference in the API call.
- The created PR shows the work item linked in Azure DevOps.
- If no work item ID is detected, the PR creation works normally without linking.

---

## Epic 5: Authentication

### US-5.1: Configure a Personal Access Token

**As a** developer,
**I want to** securely store my Azure DevOps Personal Access Token in VS Code,
**so that** the extension can call Azure DevOps APIs on my behalf for features that require authentication.

**Acceptance Criteria:**

- A command `Azure DevOps: Set Personal Access Token` is available in the command palette.
- The token is stored using VS Code's `SecretStorage` API (not in plain text settings).
- The extension indicates in the status bar or sidebar whether authentication is configured.
- Features requiring a PAT (e.g., the PR sidebar) show a clear message if no token is configured, with a link/button to set one up.
- A command `Azure DevOps: Remove Personal Access Token` is available to clear the stored token.

---

## Epic 6: Pull Request Review Actions

### US-6.1: Vote on a pull request

**As a** developer,
**I want to** vote on a pull request directly from the sidebar context menu,
**so that** I can provide my review feedback without leaving VS Code.

**Acceptance Criteria:**

- The following vote actions are available in the PR context menu:
  - **Approve** (vote: 10)
  - **Approve with Suggestions** (vote: 5)
  - **Wait for Author** (vote: -5)
  - **Reject** (vote: -10)
  - **Reset Vote** (vote: 0)
- Each action calls the Azure DevOps API to update the reviewer vote.
- The PR list refreshes automatically after a successful vote.
- A success notification is shown with the PR number.

---

### US-6.2: Complete a pull request

**As a** developer,
**I want to** complete (merge) a pull request from the sidebar context menu,
**so that** I can merge approved PRs without switching to the browser.

**Acceptance Criteria:**

- A **Complete Pull Request** action is available in the PR context menu.
- A modal confirmation dialog is shown before completing the PR.
- The extension fetches the latest `lastMergeSourceCommit` from the API (required for the merge call).
- An error is shown if the merge source commit cannot be determined.
- The PR list refreshes after successful completion.

---

### US-6.3: Abandon a pull request

**As a** developer,
**I want to** abandon a pull request from the sidebar context menu,
**so that** I can close PRs that are no longer needed without leaving the editor.

**Acceptance Criteria:**

- An **Abandon Pull Request** action is available in the PR context menu.
- A modal warning confirmation is shown before abandoning.
- The PR is closed without merging via the Azure DevOps API.
- The PR list refreshes after successful abandonment.

---

### US-6.4: Add a comment to a pull request

**As a** developer,
**I want to** add a general comment to a pull request from the sidebar,
**so that** I can leave feedback or ask questions without opening DevOps.

**Acceptance Criteria:**

- An **Add Comment** action is available in the PR context menu.
- An input box prompts for the comment text.
- The comment is posted as a general (top-level) comment via the API.
- The PR list refreshes after the comment is posted.

---

## Epic 7: Pull Request Code Review

### US-7.1: Checkout a PR branch

**As a** developer,
**I want to** checkout the source branch of a pull request from the sidebar,
**so that** I can test or review the code locally.

**Acceptance Criteria:**

- A **Checkout Branch** action is available in the PR context menu.
- The extension runs `git fetch origin` followed by `git checkout {branch}`.
- A progress notification is shown during the operation.
- A success message shows the checked-out branch name.
- Errors are shown if the workspace is unavailable or the git command fails.

---

### US-7.2: Review PR file changes

**As a** developer,
**I want to** see the list of files changed in a pull request within VS Code,
**so that** I can review the changes without opening the browser.

**Acceptance Criteria:**

- A **Review Changes** action is available in the PR context menu.
- A "PR Changes" tree view (collapsed by default) shows the files changed in the latest PR iteration.
- Each file entry displays:
  - The filename with the full path as description.
  - An icon colored by change type: green (add), red (delete), yellow (rename), blue (edit).
  - A tooltip showing `{changeType}: {fullPath}`.
- A **Clear PR Changes** button in the view header clears the current review.
- Clicking a file opens an inline diff view.

---

### US-7.3: View file diffs for PR changes

**As a** developer,
**I want to** open a diff view for any file changed in a PR,
**so that** I can see exactly what was modified.

**Acceptance Criteria:**

- Clicking a file in the PR Changes tree view opens a VS Code diff editor.
- The diff compares the file content before and after the change, fetched via the Azure DevOps API.
- For added files, the left side is empty.
- For deleted files, the right side is empty.
- A custom `azuredevops-pr://` URI scheme is used to provide file content to the diff editor.

---

## Epic 8: Pull Request Filtering & Sorting

### US-8.1: Filter pull requests

**As a** developer,
**I want to** filter the pull request list by common criteria,
**so that** I can quickly find the PRs that are most relevant.

**Acceptance Criteria:**

- A **Filter Pull Requests** button is available in the PR view header.
- The following filters are available:
  - **All** — show all PRs (default).
  - **Draft** — show only draft PRs.
  - **Needs my vote** — show only PRs where the user hasn't voted yet.
  - **Has comments** — show only PRs with unresolved comment threads.
  - **Checks failing** — show only PRs with failed blocking policies.
- The selected filter is applied immediately and the tree view updates.

---

### US-8.2: Sort pull requests

**As a** developer,
**I want to** sort the pull request list by different criteria,
**so that** I can organize PRs in the order that makes sense for my workflow.

**Acceptance Criteria:**

- A **Sort Pull Requests** button is available in the PR view header.
- The following sort options are available:
  - **Default** — server order.
  - **Title** — alphabetical by PR title.
  - **Comment count** — most comments first.
- The selected sort order is applied immediately and the tree view updates.
