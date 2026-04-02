# CLAUDE.md

This file is for any coding agent working in this repository. Read this first, then inspect the relevant files before changing behavior.

## What This Repo Is

This repository contains a VS Code extension named `Azure DevOps Integration`.

The extension is centered on four user workflows:

- browse active Azure DevOps pull requests in a custom sidebar
- review PR file changes and discussion inside VS Code
- act on PRs: vote, comment, complete, abandon, open in browser, checkout branch
- create pull requests from the current git branch, with work item support

The implementation is lightweight:

- TypeScript only
- no Azure DevOps SDK
- REST calls done manually with Node `https`
- git interactions done with `child_process.exec`
- tests run with Jest

## How The Extension Is Wired

The entrypoint is [src/extension.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/extension.ts).

On activation (`onStartupFinished`) it registers:

- command palette commands
- PR tree view in the `azureDevops` Activity Bar container
- PR changes tree view
- PR discussion tree view
- virtual document provider for PR file contents: `azuredevops-pr`
- virtual document provider for discussion thread markdown: `azuredevops-pr-comment`
- comment controller for inline PR comments in diff editors

When tracking behavior, start from `activate()` and follow command registration or provider construction from there.

## High-Level Architecture

There are five main layers:

1. Manifest and configuration
   - [package.json](/Users/luca/Documents/vscode-extensions/azure-devops-integration/package.json)
   - declares commands, menus, views, settings, activation

2. Bootstrapping and UI orchestration
   - [src/extension.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/extension.ts)
   - connects commands to providers and providers to VS Code

3. Azure DevOps integration layer
   - [src/api.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/api.ts)
   - all REST calls and most shared domain types live here

4. Local environment helpers
   - [src/config.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/config.ts)
   - [src/git.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/git.ts)
   - [src/auth.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/auth.ts)
   - [src/workItem.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/workItem.ts)

5. Feature modules
   - PR sidebar: [src/prSidebar.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/prSidebar.ts)
   - PR changes: [src/prChangesProvider.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/prChangesProvider.ts)
   - PR diff content: [src/prContentProvider.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/prContentProvider.ts)
   - inline comments: [src/prComments.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/prComments.ts)
   - discussion tree: [src/prDiscussionProvider.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/prDiscussionProvider.ts)
   - discussion document provider: [src/prCommentDocProvider.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/prCommentDocProvider.ts)
   - commands: [src/commands](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/commands)

## Core Runtime Model

### Authentication

PAT storage is in [src/auth.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/auth.ts).

- secret key: `azureDevops.pat`
- storage backend: VS Code `SecretStorage`
- most features silently stop or show an error if no PAT exists

If a new feature talks to Azure DevOps, it will almost always need `getToken(secretStorage)` first.

### Repo / Org / Project Resolution

Config resolution is in [src/config.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/config.ts).

The extension prefers auto-detection from `origin` and only falls back to settings when needed.

Supported remotes:

- `https://dev.azure.com/{org}/{project}/_git/{repo}`
- `https://{org}.visualstudio.com/{project}/_git/{repo}`
- `git@ssh.dev.azure.com:v3/{org}/{project}/{repo}`

Important functions:

- `getOrganization()`
- `getDevOpsConfig()`
- `getWorkItemProject()`
- `getBaseUrl()`

If you are adding new behavior that needs org/project/repo info, do not duplicate parsing logic. Use these helpers.

### Git Usage

Git helpers are intentionally simple in [src/git.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/git.ts).

Available helpers (all accept an optional `cwd?: string` parameter to target a specific workspace folder):

- `getCurrentBranch(cwd?)`
- `getDefaultBranch(cwd?)`
- `getRepositoryRoot(cwd?)`
- `getRemoteUrl(cwd?)`

Multi-root workspace support:

- Most features default to `vscode.workspace.workspaceFolders?.[0]` when no `cwd` is passed
- PR creation uses `pickRepository()` from `src/repoPicker.ts` to let the user choose a workspace folder when multiple Azure DevOps repos are open
- Expanding multi-root support to other commands can follow the same pattern: call `pickRepository()` and thread the `cwd` through

### Work Item Detection

Work item parsing is in [src/workItem.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/workItem.ts).

Default branch patterns:

- `AB#1234`
- `feature/1234-...`
- `bugfix/1234-...`
- `hotfix/1234-...`
- `fix/1234-...`
- `task/1234-...`
- `chore/1234-...`
- `1234-...`

Settings affecting this:

- `azureDevops.branchPrefix`
- `azureDevops.workItemPattern`

This logic drives both PR creation defaults and the status bar item.

## Commands And Where They Live

### Primary user commands

- create PR: [src/commands/createPr.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/commands/createPr.ts)
- open repository: [src/commands/openRepo.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/commands/openRepo.ts)
- open work item: [src/commands/openWorkItem.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/commands/openWorkItem.ts)
- checkout PR branch: [src/commands/checkoutBranch.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/commands/checkoutBranch.ts)
- PR actions: [src/commands/prActions.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/commands/prActions.ts)

### PR sidebar context actions

These are contributed from [package.json](/Users/luca/Documents/vscode-extensions/azure-devops-integration/package.json) and implemented across `extension.ts` and `prActions.ts`.

Actions include:

- approve
- approve with suggestions
- wait for author
- reject
- reset vote
- complete PR
- abandon PR
- add comment
- checkout branch
- open in browser
- review changes

If you add a new sidebar action, you usually need to touch both:

- [package.json](/Users/luca/Documents/vscode-extensions/azure-devops-integration/package.json)
- [src/extension.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/extension.ts) or [src/commands/prActions.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/commands/prActions.ts)

## Views And State Ownership

### PR Sidebar

Implementation: [src/prSidebar.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/prSidebar.ts)

Owner class: `PullRequestTreeProvider`

What it does:

- fetches current user ID and PR groups from Azure DevOps
- groups PRs into `Created by me`, `Assigned to me`, `Assigned to my teams`
- applies client-side filtering and sorting
- groups child items by repository if a category spans multiple repos
- computes notifications for newly increased unresolved-comment counts
- auto-refreshes via `registerPrSidebar()`

Important behavior:

- refresh interval setting: `azureDevops.pullRequestRefreshInterval`
- enforced minimum: 30 seconds
- notifications setting: `azureDevops.enableNotifications`
- filter options are implemented client-side
- sort options are implemented client-side

When editing PR list behavior, this file is usually the first place to change.

### PR Changes View

Implementation: [src/prChangesProvider.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/prChangesProvider.ts)

Owner class: `PrChangesProvider`

What it does:

- stores the currently selected PR and org
- fetches PR iterations
- uses the latest iteration only
- fetches changes for that iteration
- turns changed files into `PrFileItem` tree items
- delegates diff opening to the `azureDevops.openPrFileDiff` command

Important implication:

- the review experience is based on Azure DevOps iteration data, not on a local git diff

### PR Diff Content Provider

Implementation: [src/prContentProvider.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/prContentProvider.ts)

This module serves virtual file contents for diff editors.

Key pieces:

- scheme: `azuredevops-pr`
- `buildPrFileUri()`
- `parsePrFileUri()`
- `provideTextDocumentContent()`

URI payload includes:

- org
- project
- repoId
- commitId
- filePath
- optional `prId`
- optional `side`

If you are changing diff behavior or comment placement, understand this URI format first.

### Inline Comment Controller

Implementation: [src/prComments.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/prComments.ts)

Owner class: `PrCommentController`

What it does:

- creates a VS Code `CommentController`
- listens for opened PR virtual documents
- fetches Azure DevOps threads for the PR
- places comment threads into matching diff documents
- supports creating a new file thread
- supports replying to an existing thread
- refreshes inline thread state when discussion changes

Important constraints:

- new comment ranges are only offered on the right side of a diff
- comment placement depends on matching open virtual docs by parsed PR URI
- only file-backed threads become inline comment threads
- general PR comments are handled in the discussion tree instead

### PR Discussion View

Implementation: [src/prDiscussionProvider.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/prDiscussionProvider.ts)

Owner class: `PrDiscussionProvider`

What it does:

- stores the selected PR
- fetches PR threads and iterations
- uses latest iteration commit IDs for diff navigation
- shows general comments and file comments in one tree
- exposes commands to open a thread, reply, refresh, clear, and add a general PR comment

Behavior split:

- file comments open a diff and reveal the relevant line
- general comments open a read-only virtual markdown document

### Discussion Markdown Provider

Implementation: [src/prCommentDocProvider.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/prCommentDocProvider.ts)

This is a small in-memory content provider.

- scheme: `azuredevops-pr-comment`
- thread content is stored in a module-level `Map<number, string>`
- content is populated before the virtual document is opened
- clearing discussion also clears this content store

### Status Bar

Implementation: [src/statusBar.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/statusBar.ts)

What it does:

- derives a work item ID from the current branch
- shows `WI #<id>` if present
- opens the work item on click
- updates on configuration changes
- detects branch changes via the VS Code Git extension API (`vscode.git`), with a `.git/HEAD` file watcher fallback

This is event-driven, not polling-based.

## Azure DevOps API Surface

All network calls are in [src/api.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/api.ts).

This file is large and central. Before adding new Azure DevOps behavior, check whether the needed helper already exists.

Major capabilities already implemented:

- fetch current user ID
- fetch active PRs for:
  - created by me
  - assigned to me
  - assigned to my teams
- enrich PRs with:
  - unresolved comment counts
  - policy/check status
- resolve required reviewer identities
- vote on PRs
- complete PRs
- abandon PRs
- add general PR comments
- add file comments
- reply to threads
- fetch thread lists
- fetch PR details
- create PRs
- set PR auto-complete
- resolve repository ID
- update work item state
- fetch assigned work items
- fetch PR iterations
- fetch PR changes
- fetch file content for a specific commit

Implementation notes:

- authentication is basic auth with PAT encoded as `":" + token`
- low-level request helpers are `httpsGet()` and `httpsRequest()`
- failures usually throw `Error("HTTP <status>: <body>")`
- many higher-level callers intentionally catch and degrade gracefully

If an API change affects multiple features, expect fallout in:

- sidebar PR enrichment
- review views
- PR action commands
- PR creation

## Settings That Matter

Declared in [package.json](/Users/luca/Documents/vscode-extensions/azure-devops-integration/package.json).

Core connection settings:

- `azureDevops.organization`
- `azureDevops.project`
- `azureDevops.repository`
- `azureDevops.workItemProject`

Branch / work item parsing:

- `azureDevops.branchPrefix`
- `azureDevops.workItemPattern`

PR creation behavior:

- `azureDevops.pullRequestLinkedWorkItemState`
- `azureDevops.pullRequestAutoComplete`
- `azureDevops.pullRequestMergeStrategy`
- `azureDevops.pullRequestDeleteSourceBranch`
- `azureDevops.pullRequestCompleteWorkItems`
- `azureDevops.showAssignedWorkItems`
- `azureDevops.pullRequestAutoOpenInBrowser`
- `azureDevops.richCopyUrl`

Sidebar / notification behavior:

- `azureDevops.pullRequestRefreshInterval`
- `azureDevops.enableNotifications`

If you add a setting:

- declare it in [package.json](/Users/luca/Documents/vscode-extensions/azure-devops-integration/package.json)
- read it in the relevant module
- update [README.md](/Users/luca/Documents/vscode-extensions/azure-devops-integration/README.md) if behavior is user-facing

## PR Creation Flow

The PR creation flow in [src/commands/createPr.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/commands/createPr.ts) is one of the most complex parts of the repo.

Flow summary:

1. resolve Azure DevOps config
2. load PAT
3. read current branch and default branch
4. warn if user is on the default branch
5. derive a default title from branch naming
6. detect work item ID from branch name
7. optionally fetch assigned work items and let the user multi-select them
8. load PR template from repository files if present
9. open a temporary document so the user can edit the description
10. create the PR through Azure DevOps
11. optionally update linked work item state
12. optionally set auto-complete
13. optionally auto-open in browser
14. offer post-create actions: copy URL or open in browser

Template lookup paths:

- `.azuredevops/pull_request_template.md`
- `.azuredevops/PULL_REQUEST_TEMPLATE.md`
- `.azuredevops/pull_request_template.txt`
- `pull_request_template.md`
- `PULL_REQUEST_TEMPLATE.md`

Windows-specific note:

- rich clipboard HTML copy is implemented specially for Windows via PowerShell
- non-Windows falls back to plain text clipboard copy

If a PR creation change touches title generation, work item linking, template handling, or post-create actions, this is the file to edit.

## Where To Edit For Common Requests

If the request is about...

- new command or command label:
  - [package.json](/Users/luca/Documents/vscode-extensions/azure-devops-integration/package.json)
  - [src/extension.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/extension.ts)
  - maybe [src/commands](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/commands)

- sidebar grouping, icons, filtering, sorting, tooltip text, notifications:
  - [src/prSidebar.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/prSidebar.ts)

- PR action behavior:
  - [src/commands/prActions.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/commands/prActions.ts)
  - [src/api.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/api.ts)

- review file tree or diff-opening behavior:
  - [src/prChangesProvider.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/prChangesProvider.ts)
  - [src/prContentProvider.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/prContentProvider.ts)
  - [src/extension.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/extension.ts)

- inline comments:
  - [src/prComments.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/prComments.ts)
  - [src/api.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/api.ts)

- discussion tree, thread opening, general comments:
  - [src/prDiscussionProvider.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/prDiscussionProvider.ts)
  - [src/prCommentDocProvider.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/prCommentDocProvider.ts)

- work item detection or status bar:
  - [src/workItem.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/workItem.ts)
  - [src/statusBar.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/statusBar.ts)
  - [src/commands/openWorkItem.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/commands/openWorkItem.ts)

- repo/project/org detection:
  - [src/config.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/config.ts)
  - [src/git.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/git.ts)

- browser-opening behavior:
  - [src/commands/openRepo.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/commands/openRepo.ts)
  - [src/commands/openWorkItem.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/commands/openWorkItem.ts)
  - [src/commands/prActions.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/commands/prActions.ts)
  - [src/commands/createPr.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/commands/createPr.ts)

## Testing And Validation

Test files live in [src/__tests__](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/__tests__).

Current test coverage focuses on logic-heavy pieces such as:

- tree item rendering
- discussion providers
- content providers
- helper functions used by PR creation
- comment notification behavior

Mocked VS Code API:

- [src/__mocks__/vscode.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/__mocks__/vscode.ts)

Common commands:

- `npm run compile`
- `npm run lint`
- `npm test`

If you change:

- labels, sorting, tooltip logic, filter behavior:
  - add or update Jest tests

- API integration behavior:
  - add focused unit tests where possible
  - if not practical, at least compile and lint

- package manifest only:
  - still run compile to ensure no drift in code references

## Repo Conventions And Constraints

- Prefer existing helpers instead of adding parallel logic.
- Do not add a second Azure DevOps client layer.
- Do not assume multi-root workspace support exists.
- Do not assume local checkout state matches PR review state; review views use Azure DevOps virtual documents.
- Many modules degrade gracefully on API failure instead of crashing the extension. Preserve that unless the change explicitly needs stronger error handling.
- User-facing settings and commands should stay aligned between code, manifest, and README.

## Fast Start For An Agent

If you need to make a change quickly:

1. read [package.json](/Users/luca/Documents/vscode-extensions/azure-devops-integration/package.json) for commands, menus, views, and settings
2. read [src/extension.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/extension.ts) to see how the feature is registered
3. inspect the feature module listed in "Where To Edit For Common Requests"
4. inspect [src/api.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/api.ts) if Azure DevOps data is involved
5. update or add tests in [src/__tests__](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/__tests__)
6. run `npm run compile`, `npm run lint`, and `npm test` if the change is non-trivial

## Files Usually Worth Reading Before Editing

- [package.json](/Users/luca/Documents/vscode-extensions/azure-devops-integration/package.json)
- [src/extension.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/extension.ts)
- [src/api.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/api.ts)
- [src/prSidebar.ts](/Users/luca/Documents/vscode-extensions/azure-devops-integration/src/prSidebar.ts)
- [README.md](/Users/luca/Documents/vscode-extensions/azure-devops-integration/README.md)

If you only read one file before implementing something, read `src/extension.ts`. If you read two, add `package.json`. If the change touches Azure DevOps behavior, read `src/api.ts` next.
