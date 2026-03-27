import * as vscode from 'vscode';
import { getOrganization } from './config';
import { getToken } from './auth';
import { getMyPullRequests, getUserId, EnrichedPullRequest, MyPullRequests, PolicyCheck, PrThreadSummary } from './api';

export interface CommentNotificationEvent {
    org: string;
    pr: EnrichedPullRequest;
    thread: PrThreadSummary;
}

interface CommentNotificationHandlers {
    openComment: (event: CommentNotificationEvent) => Promise<void>;
    openInDevOps: (event: CommentNotificationEvent) => Promise<void>;
}

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
            `${commentsText}\n\n` +
            `---\n\n` +
            (reviewerLines.length > 0
                ? `**Reviewers:**\n\n${reviewerLines.join('\n')}`
                : 'No reviewers assigned')
        );

        // --- Build check children ---
        const checks = pr.checks ?? [];
        const checkChildren = checks.map((check) => PullRequestItem.fromCheck(check));

        // --- Assemble item ---
        const hasChildren = checkChildren.length > 0;
        const item = new PullRequestItem(
            label,
            hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
            hasChildren ? checkChildren : undefined
        );
        item.description = description;
        item.tooltip = tooltip;
        item.iconPath = new vscode.ThemeIcon(iconId, iconColor);
        item.contextValue = 'pullRequest';
        item.command = {
            command: 'azureDevops.reviewPrChanges',
            title: 'Review Changes',
            arguments: [item],
        };

        item.pr = pr;
        item.org = org;

        return item;
    }

    static fromCheck(check: PolicyCheck): PullRequestItem {
        let iconId: string;
        let iconColor: vscode.ThemeColor | undefined;

        switch (check.status) {
            case 'approved':
                iconId = 'pass';
                iconColor = new vscode.ThemeColor('testing.iconPassed');
                break;
            case 'rejected':
            case 'broken':
                iconId = 'error';
                iconColor = new vscode.ThemeColor('testing.iconFailed');
                break;
            case 'running':
            case 'queued':
                iconId = 'loading~spin';
                iconColor = new vscode.ThemeColor('warningForeground');
                break;
            default:
                iconId = 'circle-slash';
                iconColor = new vscode.ThemeColor('disabledForeground');
                break;
        }

        const statusLabels: Record<PolicyCheck['status'], string> = {
            approved: 'Passed',
            rejected: 'Failed',
            broken: 'Failed',
            running: 'Running',
            queued: 'Running',
            notApplicable: 'N/A',
        };
        const statusLabel = statusLabels[check.status];

        const item = new PullRequestItem(
            check.name,
            vscode.TreeItemCollapsibleState.None
        );
        item.description = statusLabel;
        item.iconPath = new vscode.ThemeIcon(iconId, iconColor);
        item.contextValue = 'policyCheck';

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
    private previousThreadSnapshot: Map<number, Map<number, number>> = new Map();
    private commentNotificationHandlers?: CommentNotificationHandlers;
    private initialized = false;
    private latestPullRequests = new Map<number, EnrichedPullRequest>();

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

    setCommentNotificationHandlers(handlers: CommentNotificationHandlers): void {
        this.commentNotificationHandlers = handlers;
    }

    getPullRequestById(prId: number): EnrichedPullRequest | undefined {
        return this.latestPullRequests.get(prId);
    }

    async getCreatedByMePullRequests(): Promise<{ org: string; pullRequests: EnrichedPullRequest[] } | undefined> {
        const fetched = await this.fetchPullRequests();
        if (!fetched) {
            return undefined;
        }

        return {
            org: fetched.org,
            pullRequests: fetched.result.createdByMe,
        };
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

    private buildThreadSnapshot(allPrs: EnrichedPullRequest[]): Map<number, Map<number, number>> {
        const snapshot = new Map<number, Map<number, number>>();

        for (const pr of allPrs) {
            snapshot.set(
                pr.pullRequestId,
                new Map(pr.commentThreads.map((thread) => [thread.threadId, thread.latestCommentId]))
            );
        }

        return snapshot;
    }

    private getNewCommentEvents(allPrs: EnrichedPullRequest[]): CommentNotificationEvent[] {
        const events: CommentNotificationEvent[] = [];
        const org = this.cachedOrg;
        if (!org) {
            return events;
        }

        for (const pr of allPrs) {
            const previousThreads = this.previousThreadSnapshot.get(pr.pullRequestId) ?? new Map<number, number>();
            for (const thread of pr.commentThreads) {
                const previousCommentId = previousThreads.get(thread.threadId);
                if (previousCommentId === undefined || thread.latestCommentId > previousCommentId) {
                    if (thread.latestCommentAuthorId && thread.latestCommentAuthorId === this.cachedUserId) {
                        continue;
                    }
                    events.push({ org, pr, thread });
                }
            }
        }

        return events;
    }

    async checkForNewComments(allPrs: EnrichedPullRequest[]): Promise<void> {
        this.latestPullRequests = new Map(allPrs.map((pr) => [pr.pullRequestId, pr]));

        const newSnapshot = this.buildThreadSnapshot(allPrs);
        const newCommentEvents = this.initialized ? this.getNewCommentEvents(allPrs) : [];

        this.previousThreadSnapshot = newSnapshot;
        this.initialized = true;

        if (newCommentEvents.length === 1) {
            const event = newCommentEvents[0];
            const selection = await vscode.window.showInformationMessage(
                `New comments on PR #${event.pr.pullRequestId}: ${event.pr.title}`,
                'Open Comment',
                'Open in DevOps'
            );

            if (selection === 'Open Comment') {
                await this.commentNotificationHandlers?.openComment(event);
            } else if (selection === 'Open in DevOps') {
                await this.commentNotificationHandlers?.openInDevOps(event);
            }
        } else if (newCommentEvents.length > 1) {
            await vscode.window.showInformationMessage(
                `New comments on ${newCommentEvents.length} discussion threads`
            );
        }
    }

    private async fetchPullRequests(): Promise<{ org: string; result: MyPullRequests } | undefined> {
        const token = await getToken(this.secretStorage);
        if (!token) { return undefined; }

        let org: string;
        try {
            org = await getOrganization();
        } catch {
            return undefined;
        }

        this.cachedOrg = org;
        try {
            this.cachedUserId = await getUserId(org, token);
        } catch { /* ignore */ }

        try {
            const result = await getMyPullRequests(org, token);
            return { org, result };
        } catch {
            return undefined;
        }
    }

    async pollForNewComments(): Promise<void> {
        const fetched = await this.fetchPullRequests();
        if (!fetched) { return; }

        const { createdByMe, assignedToMe, assignedToMyTeams } = fetched.result;
        const scope = vscode.workspace
            .getConfiguration('azureDevops')
            .get<string>('notificationScope', 'all');

        let prsForNotifications: EnrichedPullRequest[];
        if (scope === 'off') {
            prsForNotifications = [];
        } else if (scope === 'participating') {
            prsForNotifications = [...createdByMe, ...assignedToMe];
        } else {
            prsForNotifications = [...createdByMe, ...assignedToMe, ...assignedToMyTeams];
        }

        await this.checkForNewComments(prsForNotifications);
        this.refresh();
    }

    getTreeItem(element: PullRequestItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: PullRequestItem): Promise<PullRequestItem[]> {
        if (element) {
            return element.children || [];
        }

        // Root level
        const fetched = await this.fetchPullRequests();
        if (!fetched) {
            const token = await getToken(this.secretStorage);
            if (!token) {
                return [
                    PullRequestItem.message(
                        'Set up PAT to view pull requests',
                        'azureDevops.setToken'
                    ),
                ];
            }
            return [PullRequestItem.message('Failed to fetch pull requests')];
        }

        const { org, result } = fetched;
        const { createdByMe, assignedToMe, assignedToMyTeams } = result;

        await this.checkForNewComments([...createdByMe, ...assignedToMe, ...assignedToMyTeams]);

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

    // Establish baseline comment counts immediately so the first interval
    // poll can detect changes (the call is fire-and-forget).
    provider.pollForNewComments();

    const settings = vscode.workspace.getConfiguration('azureDevops');
    let intervalSeconds = settings.get<number>('pullRequestRefreshInterval', 60);
    if (intervalSeconds < 30) {
        intervalSeconds = 30;
    }

    const intervalHandle = setInterval(() => {
        provider.pollForNewComments();
    }, intervalSeconds * 1000);

    context.subscriptions.push({
        dispose: () => clearInterval(intervalHandle),
    });

    return provider;
}
