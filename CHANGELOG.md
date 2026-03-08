# Changelog

All notable changes to the "Azure DevOps Integration" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
