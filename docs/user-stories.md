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

- The extension parses the git remote URL (both `https://dev.azure.com/{org}/{project}/_git/{repo}` and `{org}@vs-ssh.visualstudio.com:v3/{org}/{project}/{repo}` formats).
- Auto-detected values are used as defaults when no manual configuration is provided.
- Manual settings take precedence over auto-detected values.
- If auto-detection fails and no manual config exists, the user is prompted to configure the settings.

---

## Epic 2: Browser-Based Quick Actions

### US-2.1: Create a pull request from the current branch

**As a** developer,
**I want to** run a command that opens the Azure DevOps "Create Pull Request" page in my browser, pre-filled with my current branch as the source,
**so that** I can create a PR without manually navigating to DevOps and selecting my branch.

**Acceptance Criteria:**

- A command `Azure DevOps: Create Pull Request` is available in the command palette.
- The command opens the browser with the URL: `https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequestcreate?sourceRef={currentBranch}`.
- The current branch is determined from the local git repository.
- If the user is on the default branch (e.g., `main`), a warning is shown: "You are on the default branch. Are you sure you want to create a PR from here?"

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

### US-3.1: View assigned pull requests in a tree view

**As a** developer,
**I want to** see my assigned pull requests in a sidebar panel within VS Code,
**so that** I can keep track of PRs that need my attention without leaving my editor.

**Acceptance Criteria:**

- A new view container or tree view is added to the VS Code sidebar (e.g., under the SCM or a dedicated Azure DevOps section).
- The tree view displays PRs where the current user is a reviewer, grouped by status (e.g., "Active", "Drafts").
- Each PR entry shows: title, source branch, author, and review status (Approved / Waiting / Rejected).
- A Personal Access Token (PAT) is required and configurable in extension settings for API access.
- The list refreshes automatically on a configurable interval (default: 5 minutes).
- A manual refresh button is available in the tree view header.
- A manual refresh command `Azure DevOps: Refresh Pull Requests` is also available.

---

### US-3.2: Open a pull request from the sidebar

**As a** developer,
**I want to** click on a pull request in the sidebar to open it in Azure DevOps,
**so that** I can quickly review or take action on it.

**Acceptance Criteria:**

- Clicking a PR item in the tree view opens the PR page in the browser: `https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{prId}`.
- The URL uses the correct repository for the PR (which may differ from the currently open repo).

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
**I want to** the "Create Pull Request" URL to include the detected work item ID,
**so that** the PR is automatically linked to the correct work item without extra manual steps.

**Acceptance Criteria:**

- When a work item ID is detected from the branch name (US-4.1), the "Create Pull Request" command (US-2.1) appends it to the URL as a linked work item.
- The Azure DevOps create PR page shows the work item pre-linked.
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
