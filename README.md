# Azure DevOps Integration for VS Code

A VS Code extension for Azure DevOps. Browse pull requests in a sidebar grouped by "Created by me," "Assigned to me," and "My teams," review changes and discussion in a unified tree, inspect linked work items, create PRs, and edit PR titles and descriptions without leaving the editor.

## Features

### Pull Request Sidebar

View your assigned pull requests directly in the Activity Bar. PRs are grouped into three categories:

- **Created by me** — PRs you authored
- **Assigned to me** — PRs where you're a reviewer
- **Assigned to my teams** — PRs assigned to teams you belong to

Each PR displays rich status information:

- Draft and review/check status via the PR icon
- Relative age (e.g. `2d ago`)
- Source branch as an expandable child item
- Check summary with per-check child items when policies exist
- Linked work items as expandable child items, including type and state
- Pipeline-backed policy checks can be clicked to open the corresponding Azure DevOps pipeline run in the browser

Click any PR to open its `PR Changes` view in VS Code. Changed files can expand to show file-level discussion threads, and general PR comments are grouped under a `General Comments` node. From the thread context menu you can reply, resolve, reactivate, or mark a thread as `Won't Fix` or `By Design`. Use the PR context menu to open the PR in Azure DevOps, add comments, or edit the PR description when needed.

When viewing a PR diff, approve, reject, and wait-for-author buttons appear in the editor title bar for quick voting without leaving the diff.

The PR context menu also includes **Edit Title**, which opens an input box pre-filled with the current pull request title and updates the PR immediately after confirmation.

When a policy check is backed by an Azure DevOps build validation run, clicking that check opens the pipeline results page directly in your browser.

### Comment Notifications And Discussion

The extension can notify you when new PR discussion activity is detected during background refresh.

- Single new discussion event notifications include `Open Comment` and `Open in DevOps`
- `Open Comment` opens the relevant target in VS Code
- File comments open the PR diff and reveal the commented line
- General comments open the full discussion thread in a read-only editor
- When multiple new discussion events are detected at once, the extension shows a summary notification instead of guessing which thread to open

### Work Item Detection

The extension automatically extracts work item IDs from your branch name using common patterns:

- `#1234`
- `feature/1234-description`
- `1234-description`
- `bugfix/1234-description`

The detected work item is shown in the **status bar** (e.g., `WI #1234`) and clicking it opens the work item in Azure DevOps. Pull requests in the sidebar also show any linked work items, and selecting one opens that work item in the browser.

### Sprint Task Creation

Use **Azure DevOps: Create Task for PR** to create a Task in the active sprint without leaving VS Code.

- In multi-root workspaces, the command first asks which repository to use
- The extension looks up the current iteration for your configured team
- If Azure DevOps reports multiple current iterations, you choose the sprint explicitly instead of relying on server order
- It lets you choose a parent backlog item from that sprint, filtered to the team's configured area paths
- The new task is assigned to your current Azure DevOps identity
- You can optionally force the initial task state with `azureDevops.taskState` such as `Active`
- The task title is pre-filled from the current branch name after removing your configured personal branch prefix and common branch-type prefixes like `feature/` or `task/`
- If the current branch already has an open pull request, the new task is linked to that PR automatically

If your Azure DevOps sprint URL looks like `/.../_sprints/taskboard/stackportal/...`, set `azureDevops.team` to `stackportal`.
The parent picker will then use that team's area-path configuration, so items from sibling areas such as `stackinsights` are excluded unless the team itself is configured to include them.

### Commands

Open the Command Palette (`Cmd+Shift+P`) and type "Azure DevOps" to access:

| Command | Description |
|---------|-------------|
| **Azure DevOps: Create Pull Request** | Creates a PR from the current branch. In multi-root workspaces, prompts you to choose which repository to use. Checks that the branch is pushed to origin first, offering to push if not. Automatically links detected work items, strips the configured personal branch prefix from the suggested title, appends selected work item titles to the description, and applies a repository PR template when available. |
| **Azure DevOps: Create Task for PR** | Creates a Task work item in the current sprint under a selected parent (User Story, Bug, or Enabler). Assigns it to you, suggests a title from the current branch, and links it to the current branch's pull request when one is found. |
| **Azure DevOps: Open Repository** | Opens the repository in Azure DevOps. |
| **Azure DevOps: Open Work Item** | Opens a work item by ID. Pre-fills the detected ID from the current branch. |
| **Azure DevOps: Edit Pull Request Description** | Lets you pick one of your authored pull requests, opens its current description in a temporary markdown editor, and updates the PR when you close the tab. |
| **Azure DevOps: Set Personal Access Token** | Configure your PAT for API access. |
| **Azure DevOps: Remove Personal Access Token** | Remove your stored PAT. |
| **Azure DevOps: Refresh Pull Requests** | Manually refresh the PR sidebar. |

The PR sidebar context menu also includes **Edit Title**, which opens an input box pre-filled with the current pull request title and updates the PR immediately after confirmation.

## Getting Started

### 1. Install the Extension

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=lucacelea.azure-devops-integration) or search for "Azure DevOps Integration" in the Extensions view.

### 2. Set Up Authentication

1. Generate a [Personal Access Token (PAT)](https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate) in Azure DevOps with the following scopes:
   - **Code**: Read
   - **Work Items**: Read
   - **Project and Team**: Read
2. Run the command **Azure DevOps: Set Personal Access Token** and paste your token.

Your PAT is stored securely using VS Code's built-in SecretStorage API.

### 3. Open a Repository

Open a folder that has an Azure DevOps git remote. The extension auto-detects your organization, project, and repository from the remote URL.

Supported remote formats:
- `https://dev.azure.com/{org}/{project}/_git/{repo}`
- `https://{org}.visualstudio.com/{project}/_git/{repo}`
- `git@ssh.dev.azure.com:v3/{org}/{project}/{repo}`

## Configuration

All settings are optional — the extension auto-detects values from your git remote.

| Setting | Default | Description |
|---------|---------|-------------|
| `azureDevops.organization` | Auto-detected | Azure DevOps organization name |
| `azureDevops.project` | Auto-detected | Azure DevOps project name |
| `azureDevops.repository` | Auto-detected | Azure DevOps repository name |
| `azureDevops.workItemProject` | Same as project | Project for work items, if different from the repo's project |
| `azureDevops.team` | `"{project} Team"` | Azure DevOps team used when querying the current sprint/iteration for task creation. This should match the team segment from your sprint board URL, for example `stackportal` in `.../_sprints/taskboard/stackportal/...` |
| `azureDevops.taskState` | `""` | Optional initial state for newly created Task work items, for example `Active`. Leave empty to use the process default |
| `azureDevops.branchPrefix` | `""` | Personal branch prefix to strip (e.g., `lucac/`) when parsing branch names and generating the default PR title |
| `azureDevops.workItemPattern` | Built-in patterns | Custom regex to extract work item ID from branch name |
| `azureDevops.pullRequestLinkedWorkItemState` | `""` | Optional state to set on linked work item when creating a PR (leave empty to disable) |
| `azureDevops.pullRequestAutoComplete` | `false` | Automatically set auto-complete on newly created pull requests |
| `azureDevops.pullRequestMergeStrategy` | `squash` | Merge strategy to use when auto-completing a pull request |
| `azureDevops.pullRequestDeleteSourceBranch` | `true` | Delete the source branch after merge when auto-complete is set |
| `azureDevops.pullRequestCompleteWorkItems` | `true` | Complete associated work items after merge when auto-complete is set |
| `azureDevops.showAssignedWorkItems` | `true` | Show a work item picker during PR creation to select assigned work items to link |
| `azureDevops.pullRequestRefreshInterval` | `60` | Auto-refresh interval in seconds (minimum 30) |
| `azureDevops.pullRequestAutoOpenInBrowser` | `false` | Automatically open the pull request in the browser after creation |
| `azureDevops.richCopyUrl` | `false` | Copy a rich link with the PR title when copying the pull request URL |
| `azureDevops.notificationScope` | `all` | Which PRs trigger notifications: `all` (all visible PRs), `participating` (only PRs you created or are assigned to), or `off` (no notifications) |

## Requirements

- VS Code 1.85.0 or later
- An Azure DevOps account with a Personal Access Token

## Development

### CI checks

GitHub Actions runs `compile`, `lint`, and `test` on every pull request and on pushes to `main`.

### Releases

Releases are published from GitHub Actions when you push a version tag:

1. Update `package.json` and `CHANGELOG.md`
2. Commit and push to `main`
3. Create and push a tag that matches the package version, for example `v0.3.0`

The release workflow will:

- verify the tag matches `package.json`
- run compile, lint, and tests
- build a `.vsix`
- publish the extension to the Visual Studio Marketplace
- upload the `.vsix` to the GitHub Actions run and the GitHub release

Required GitHub secret:

- `VSCE_PAT`: Visual Studio Marketplace personal access token for the `lucacelea` publisher

### Branch protection

In GitHub repository settings, protect `main` and require the `Build and Test` status check before merging pull requests.

Recommended settings:

- require pull requests before merging
- require status checks to pass before merging
- select the `Build and Test` check from the `CI` workflow
- require branches to be up to date before merging
- restrict direct pushes to `main`

See [CONTRIBUTING.md](CONTRIBUTING.md) for the local development and PR flow.

## License

[MIT](LICENSE)
