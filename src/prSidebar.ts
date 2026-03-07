import * as vscode from 'vscode';
import { getOrganization } from './config';
import { getToken } from './auth';
import { getMyPullRequests, EnrichedPullRequest } from './api';

export class PullRequestItem extends vscode.TreeItem {
    public children?: PullRequestItem[];

    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        children?: PullRequestItem[]
    ) {
        super(label, collapsibleState);
        this.children = children;
    }

    static fromCategory(name: string, children: PullRequestItem[]): PullRequestItem {
        const item = new PullRequestItem(
            `${name} (${children.length})`,
            vscode.TreeItemCollapsibleState.Expanded,
            children
        );
        return item;
    }

    static fromPullRequest(
        pr: EnrichedPullRequest,
        org: string
    ): PullRequestItem {
        const branch = pr.sourceBranch?.replace(/^refs\/heads\//, '') ?? '';
        const repoName = pr.repository?.name ?? '';
        const prProject = pr.repository?.project?.name ?? '';
        const prUrl = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(prProject)}/_git/${encodeURIComponent(repoName)}/pullrequest/${pr.pullRequestId}`;

        const voteDescriptions = pr.reviewers.map((r) => {
            let voteLabel: string;
            switch (r.vote) {
                case 10: voteLabel = 'approved'; break;
                case 5: voteLabel = 'approved with suggestions'; break;
                case -5: voteLabel = 'waiting for author'; break;
                case -10: voteLabel = 'rejected'; break;
                default: voteLabel = 'no vote'; break;
            }
            return `${r.displayName}: ${voteLabel}`;
        });

        // Build description with branch, checks, and comments
        const checksIcon =
            pr.checksStatus === 'passed' ? '$(pass-filled)' :
            pr.checksStatus === 'failed' ? '$(error)' :
            pr.checksStatus === 'running' ? '$(loading~spin)' : '';
        const commentsIcon = pr.unresolvedCommentCount > 0
            ? `$(comment-discussion) ${pr.unresolvedCommentCount}`
            : '';
        const statusParts = [branch, checksIcon, commentsIcon].filter(Boolean);

        const item = new PullRequestItem(
            pr.title,
            vscode.TreeItemCollapsibleState.None
        );
        item.description = statusParts.join('  ');

        // Build rich tooltip
        const checksLabel =
            pr.checksStatus === 'passed' ? 'Checks: **passed** $(pass-filled)' :
            pr.checksStatus === 'failed' ? 'Checks: **failed** $(error)' :
            pr.checksStatus === 'running' ? 'Checks: **running** $(loading~spin)' :
            'Checks: none';
        const commentsLabel = pr.unresolvedCommentCount > 0
            ? `Unresolved comments: **${pr.unresolvedCommentCount}**`
            : 'No unresolved comments';

        item.tooltip = new vscode.MarkdownString(
            `**${pr.title}**\n\n` +
            `Author: ${pr.createdBy.displayName}\n\n` +
            `Branch: \`${branch}\`\n\n` +
            `${checksLabel}\n\n` +
            `${commentsLabel}\n\n` +
            (voteDescriptions.length > 0
                ? `Reviewers:\n${voteDescriptions.map((v) => `- ${v}`).join('\n')}`
                : 'No reviewers')
        );
        item.tooltip.supportThemeIcons = true;

        // Icon reflects checks status
        const iconId =
            pr.checksStatus === 'failed' ? 'git-pull-request-closed' :
            pr.checksStatus === 'passed' ? 'git-pull-request-go-to-changes' :
            'git-pull-request';
        item.iconPath = new vscode.ThemeIcon(iconId);
        item.contextValue = 'pullRequest';
        item.command = {
            command: 'vscode.open',
            title: 'Open Pull Request',
            arguments: [vscode.Uri.parse(prUrl)],
        };

        return item;
    }

    static message(text: string, command?: string): PullRequestItem {
        const item = new PullRequestItem(text, vscode.TreeItemCollapsibleState.None);
        if (command) {
            item.command = {
                command,
                title: text,
            };
        }
        return item;
    }
}

export class PullRequestTreeProvider implements vscode.TreeDataProvider<PullRequestItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<PullRequestItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private secretStorage: vscode.SecretStorage;

    constructor(secretStorage: vscode.SecretStorage) {
        this.secretStorage = secretStorage;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: PullRequestItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: PullRequestItem): Promise<PullRequestItem[]> {
        if (element) {
            return element.children || [];
        }

        // Root level
        const token = await getToken(this.secretStorage);
        if (!token) {
            return [
                PullRequestItem.message(
                    'Set up PAT to view pull requests',
                    'azureDevops.setToken'
                ),
            ];
        }

        let org: string;
        try {
            org = await getOrganization();
        } catch (e: any) {
            return [PullRequestItem.message(e.message || 'Failed to get Azure DevOps organization')];
        }

        let result;
        try {
            result = await getMyPullRequests(org, token);
        } catch (e: any) {
            return [PullRequestItem.message(`Error fetching PRs: ${e.message}`)];
        }

        const { createdByMe, assignedToMe, assignedToMyTeams } = result;

        if (createdByMe.length === 0 && assignedToMe.length === 0 && assignedToMyTeams.length === 0) {
            return [PullRequestItem.message('No pull requests')];
        }

        const categories: PullRequestItem[] = [];

        if (createdByMe.length > 0) {
            const items = createdByMe.map((pr) =>
                PullRequestItem.fromPullRequest(pr, org)
            );
            categories.push(PullRequestItem.fromCategory('Created by me', items));
        }

        if (assignedToMe.length > 0) {
            const items = assignedToMe.map((pr) =>
                PullRequestItem.fromPullRequest(pr, org)
            );
            categories.push(PullRequestItem.fromCategory('Assigned to me', items));
        }

        if (assignedToMyTeams.length > 0) {
            const items = assignedToMyTeams.map((pr) =>
                PullRequestItem.fromPullRequest(pr, org)
            );
            categories.push(PullRequestItem.fromCategory('Assigned to my teams', items));
        }

        return categories;
    }
}

export function registerPrSidebar(
    context: vscode.ExtensionContext,
    secretStorage: vscode.SecretStorage
): PullRequestTreeProvider {
    const provider = new PullRequestTreeProvider(secretStorage);

    vscode.window.registerTreeDataProvider('azureDevops.pullRequests', provider);

    const settings = vscode.workspace.getConfiguration('azureDevops');
    let intervalSeconds = settings.get<number>('pullRequestRefreshInterval', 300);
    if (intervalSeconds < 30) {
        intervalSeconds = 30;
    }

    const intervalHandle = setInterval(() => {
        provider.refresh();
    }, intervalSeconds * 1000);

    context.subscriptions.push({
        dispose: () => clearInterval(intervalHandle),
    });

    return provider;
}
