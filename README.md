# Azure DevOps Integration for VS Code

A VS Code extension for Azure DevOps. Browse pull requests in a sidebar grouped by "Created by me," "Assigned to me," and "My teams," with review, check, and comment status. Auto-detects config from git remotes and extracts work item IDs from branch names. Create PRs, open repos, and link work items — all without leaving the editor.

## Features

### Pull Request Sidebar

View your assigned pull requests directly in the Activity Bar. PRs are grouped into three categories:

- **Created by me** — PRs you authored
- **Assigned to me** — PRs where you're a reviewer
- **Assigned to my teams** — PRs assigned to teams you belong to

Each PR displays rich status information:

- Draft indicator
- Source branch
- Author and reviewer names
- Review status (Approved / Waiting / Rejected)
- Check status (Passed / Failed / Running)
- Unresolved comment count

Click any PR to open it in Azure DevOps.

### Work Item Detection

The extension automatically extracts work item IDs from your branch name using common patterns:

- `AB#1234`
- `feature/1234-description`
- `1234-description`
- `bugfix/1234-description`

The detected work item is shown in the **status bar** (e.g., `WI #1234`) and clicking it opens the work item in Azure DevOps.

### Commands

Open the Command Palette (`Cmd+Shift+P`) and type "Azure DevOps" to access:

| Command | Description |
|---------|-------------|
| **Azure DevOps: Create Pull Request** | Creates a PR from the current branch. Automatically links detected work items and applies a repository PR template when available. |
| **Azure DevOps: Open Repository** | Opens the repository in Azure DevOps. |
| **Azure DevOps: Open Work Item** | Opens a work item by ID. Pre-fills the detected ID from the current branch. |
| **Azure DevOps: Set Personal Access Token** | Configure your PAT for API access. |
| **Azure DevOps: Remove Personal Access Token** | Remove your stored PAT. |
| **Azure DevOps: Refresh Pull Requests** | Manually refresh the PR sidebar. |

## Getting Started

### 1. Install the Extension

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=lucac.azure-devops-integration) or search for "Azure DevOps Integration" in the Extensions view.

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
| `azureDevops.branchPrefix` | `""` | Personal branch prefix to strip (e.g., `lucac/`) |
| `azureDevops.workItemPattern` | Built-in patterns | Custom regex to extract work item ID from branch name |
| `azureDevops.pullRequestLinkedWorkItemState` | `""` | Optional state to set on linked work item when creating a PR (leave empty to disable) |
| `azureDevops.showAssignedWorkItems` | `true` | Show a work item picker during PR creation to select assigned work items to link |
| `azureDevops.pullRequestRefreshInterval` | `300` | Auto-refresh interval in seconds (minimum 30) |

## Requirements

- VS Code 1.85.0 or later
- An Azure DevOps account with a Personal Access Token

## License

[MIT](LICENSE)
