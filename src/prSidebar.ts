import * as vscode from 'vscode';
import { getOrganization } from './config';
import { getToken } from './auth';
import { getMyPullRequests, getUserId, EnrichedPullRequest } from './api';

export class PullRequestItem extends vscode.TreeItem {
    public children?: PullRequestItem[];
    public pr?: EnrichedPullRequest;
    public org?: string;

    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        children?: PullRequestItem[]
    ) {
        super(label, collapsibleState);
        this.children = children;
    }

    static fromCategory(name: string, prItems: PullRequestItem[]): PullRequestItem {
        // Group PRs by repository
        const repoGroups = new Map<string, PullRequestItem[]>();
        for (const prItem of prItems) {
            const repoName = prItem.pr?.repository?.name ?? 'Unknown';
            let group = repoGroups.get(repoName);
            if (!group) {
                group = [];
                repoGroups.set(repoName, group);
            }
            group.push(prItem);
        }

        let children: PullRequestItem[];
        if (repoGroups.size === 1) {
            // Single repo — no need for an extra nesting level
            children = prItems;
        } else {
            // Multiple repos — add repo sub-groups
            children = [];
            for (const [repoName, items] of repoGroups) {
                const repoItem = new PullRequestItem(
                    `${repoName} (${items.length})`,
                    vscode.TreeItemCollapsibleState.Expanded,
                    items
                );
                repoItem.iconPath = new vscode.ThemeIcon('repo');
                children.push(repoItem);
            }
        }

        const item = new PullRequestItem(
            `${name} (${prItems.length})`,
            vscode.TreeItemCollapsibleState.Expanded,
            children
        );
        return item;
    }

    static fromPullRequest(
        pr: EnrichedPullRequest,
        org: string
    ): PullRequestItem {
        const branch = pr.sourceRefName?.replace(/^refs\/heads\//, '') ?? '';
        const repoName = pr.repository?.name ?? '';
        const prProject = pr.repository?.project?.name ?? '';
        const prUrl = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(prProject)}/_git/${encodeURIComponent(repoName)}/pullrequest/${pr.pullRequestId}`;

        const reviewers = pr.reviewers ?? [];
        const hasRejection = reviewers.some((r) => r.vote === -10);
        const allApproved = reviewers.length > 0 && reviewers.every((r) => r.vote >= 5);

        // --- Icon: primary status signal (worst-case priority) ---
        let iconId: string;
        let iconColor: vscode.ThemeColor | undefined;
        if (pr.isDraft) {
            iconId = 'git-pull-request-draft';
        } else if (pr.checksStatus === 'failed') {
            iconId = 'error';
            iconColor = new vscode.ThemeColor('errorForeground');
        } else if (hasRejection) {
            iconId = 'git-pull-request-closed';
            iconColor = new vscode.ThemeColor('errorForeground');
        } else if (pr.checksStatus === 'running') {
            iconId = 'git-pull-request';
            iconColor = new vscode.ThemeColor('warningForeground');
        } else if (allApproved) {
            iconId = 'git-pull-request-go-to-changes';
            iconColor = new vscode.ThemeColor('testing.iconPassed');
        } else {
            iconId = 'git-pull-request';
        }

        // --- Label ---
        const label = pr.isDraft ? `[Draft] ${pr.title}` : pr.title;

        // --- Description: just the branch name ---
        const description = branch;

        // --- Tooltip: plain markdown (no codicons — they don't render reliably in tree tooltips) ---
        const checksText =
            pr.checksStatus === 'passed'  ? '\u2714 Checks: **passed**' :
            pr.checksStatus === 'failed'  ? '\u2718 Checks: **failed**' :
            pr.checksStatus === 'running' ? '\u25CB Checks: **running**' :
            '\u2014 Checks: none';

        const commentsText = pr.unresolvedCommentCount > 0
            ? `\u25A0 Unresolved comments: **${pr.unresolvedCommentCount}**`
            : '\u2714 No unresolved comments';

        const reviewerLines = reviewers.map((r) => {
            const symbol =
                r.vote >= 5    ? '\u2714' :
                r.vote === -5  ? '\u25CB' :
                r.vote === -10 ? '\u2718' :
                '\u2013';
            const rLabel =
                r.vote === 10  ? 'approved' :
                r.vote === 5   ? 'approved with suggestions' :
                r.vote === -5  ? 'waiting for author' :
                r.vote === -10 ? 'rejected' :
                'no vote';
            return `- ${symbol} ${r.displayName} \u2014 ${rLabel}`;
        });

        const draftLine = pr.isDraft ? '**Draft**\n\n' : '';

        const tooltip = new vscode.MarkdownString(
            `**${pr.title}** #${pr.pullRequestId}\n\n` +
            draftLine +
            `Author: ${pr.createdBy.displayName}  \n` +
            `Branch: ${branch}\n\n` +
            `---\n\n` +
            `${checksText}  \n` +
            `${commentsText}\n\n` +
            `---\n\n` +
            (reviewerLines.length > 0
                ? `**Reviewers:**\n\n${reviewerLines.join('\n')}`
                : 'No reviewers assigned')
        );

        // --- Assemble item ---
        const item = new PullRequestItem(label, vscode.TreeItemCollapsibleState.None);
        item.description = description;
        item.tooltip = tooltip;
        item.iconPath = new vscode.ThemeIcon(iconId, iconColor);
        item.contextValue = 'pullRequest';
        item.command = {
            command: 'vscode.open',
            title: 'Open Pull Request',
            arguments: [vscode.Uri.parse(prUrl)],
        };

        item.pr = pr;
        item.org = org;

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

export type PrFilter = 'all' | 'draft' | 'needsMyVote' | 'hasComments' | 'checksFailing';
export type PrSort = 'default' | 'title' | 'commentCount';

export class PullRequestTreeProvider implements vscode.TreeDataProvider<PullRequestItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<PullRequestItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    public secretStorage: vscode.SecretStorage;
    public cachedUserId?: string;
    public cachedOrg?: string;
    private currentFilter: PrFilter = 'all';
    private currentSort: PrSort = 'default';

    constructor(secretStorage: vscode.SecretStorage) {
        this.secretStorage = secretStorage;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setFilter(filter: PrFilter): void {
        this.currentFilter = filter;
        this._onDidChangeTreeData.fire();
    }

    setSort(sort: PrSort): void {
        this.currentSort = sort;
        this._onDidChangeTreeData.fire();
    }

    getFilterLabel(): string {
        const labels: Record<PrFilter, string> = {
            all: '',
            draft: 'Drafts',
            needsMyVote: 'Needs my vote',
            hasComments: 'Has unresolved comments',
            checksFailing: 'Checks failing',
        };
        return labels[this.currentFilter];
    }

    private filterPrs(prs: EnrichedPullRequest[]): EnrichedPullRequest[] {
        switch (this.currentFilter) {
            case 'draft':
                return prs.filter(pr => pr.isDraft);
            case 'needsMyVote':
                return prs.filter(pr => {
                    const myReview = pr.reviewers?.find(r => r.id === this.cachedUserId);
                    return myReview && myReview.vote === 0;
                });
            case 'hasComments':
                return prs.filter(pr => pr.unresolvedCommentCount > 0);
            case 'checksFailing':
                return prs.filter(pr => pr.checksStatus === 'failed');
            default:
                return prs;
        }
    }

    private sortPrs(prs: EnrichedPullRequest[]): EnrichedPullRequest[] {
        switch (this.currentSort) {
            case 'title':
                return [...prs].sort((a, b) => a.title.localeCompare(b.title));
            case 'commentCount':
                return [...prs].sort((a, b) => b.unresolvedCommentCount - a.unresolvedCommentCount);
            default:
                return prs;
        }
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

        this.cachedOrg = org;
        try {
            this.cachedUserId = await getUserId(org, token);
        } catch { /* ignore */ }

        let result;
        try {
            result = await getMyPullRequests(org, token);
        } catch (e: any) {
            return [PullRequestItem.message(`Error fetching PRs: ${e.message}`)];
        }

        const { createdByMe, assignedToMe, assignedToMyTeams } = result;

        const filteredCreated = this.sortPrs(this.filterPrs(createdByMe));
        const filteredAssigned = this.sortPrs(this.filterPrs(assignedToMe));
        const filteredTeams = this.sortPrs(this.filterPrs(assignedToMyTeams));

        if (filteredCreated.length === 0 && filteredAssigned.length === 0 && filteredTeams.length === 0) {
            const filterLabel = this.getFilterLabel();
            return [PullRequestItem.message(filterLabel ? `No pull requests matching "${filterLabel}"` : 'No pull requests')];
        }

        const categories: PullRequestItem[] = [];

        if (filteredCreated.length > 0) {
            const items = filteredCreated.map((pr) => PullRequestItem.fromPullRequest(pr, org));
            categories.push(PullRequestItem.fromCategory('Created by me', items));
        }

        if (filteredAssigned.length > 0) {
            const items = filteredAssigned.map((pr) => PullRequestItem.fromPullRequest(pr, org));
            categories.push(PullRequestItem.fromCategory('Assigned to me', items));
        }

        if (filteredTeams.length > 0) {
            const items = filteredTeams.map((pr) => PullRequestItem.fromPullRequest(pr, org));
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
