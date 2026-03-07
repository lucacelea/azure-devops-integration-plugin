import * as vscode from 'vscode';
import { getDevOpsConfig } from './config';
import { getToken } from './auth';
import { getAssignedPullRequests, PullRequest } from './api';

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
        pr: PullRequest,
        org: string,
        project: string
    ): PullRequestItem {
        const branch = pr.sourceBranch.replace(/^refs\/heads\//, '');
        const repoName = pr.repository.name;
        const prProject = pr.repository.project.name;
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

        const item = new PullRequestItem(
            pr.title,
            vscode.TreeItemCollapsibleState.None
        );
        item.description = branch;
        item.tooltip = new vscode.MarkdownString(
            `**${pr.title}**\n\n` +
            `Author: ${pr.createdBy.displayName}\n\n` +
            `Branch: \`${branch}\`\n\n` +
            (voteDescriptions.length > 0
                ? `Reviewers:\n${voteDescriptions.map((v) => `- ${v}`).join('\n')}`
                : 'No reviewers')
        );
        item.iconPath = new vscode.ThemeIcon('git-pull-request');
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

        let config;
        try {
            config = await getDevOpsConfig();
        } catch (e: any) {
            return [PullRequestItem.message(e.message || 'Failed to get Azure DevOps configuration')];
        }

        let pullRequests: PullRequest[];
        try {
            pullRequests = await getAssignedPullRequests(config.organization, config.project, token);
        } catch (e: any) {
            return [PullRequestItem.message(`Error fetching PRs: ${e.message}`)];
        }

        if (pullRequests.length === 0) {
            return [PullRequestItem.message('No pull requests assigned to you')];
        }

        const active = pullRequests.filter((pr) => !pr.isDraft);
        const drafts = pullRequests.filter((pr) => pr.isDraft);

        const categories: PullRequestItem[] = [];

        if (active.length > 0) {
            const items = active.map((pr) =>
                PullRequestItem.fromPullRequest(pr, config.organization, config.project)
            );
            categories.push(PullRequestItem.fromCategory('Active', items));
        }

        if (drafts.length > 0) {
            const items = drafts.map((pr) =>
                PullRequestItem.fromPullRequest(pr, config.organization, config.project)
            );
            categories.push(PullRequestItem.fromCategory('Drafts', items));
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
