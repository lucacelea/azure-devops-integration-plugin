import * as vscode from 'vscode';
import { EnrichedPullRequest, getPrIterations, getPrChanges, PrChange, PrThreadSummary } from './api';
import { getToken } from './auth';

export class PrFileItem extends vscode.TreeItem {
    constructor(
        public readonly change: PrChange,
        public readonly org: string,
        public readonly project: string,
        public readonly repoId: string,
        public readonly sourceCommitId: string,
        public readonly targetCommitId: string,
        public readonly prId: number,
        commentCount?: number,
    ) {
        const fileName = change.item.path.split('/').pop() ?? change.item.path;
        super(fileName, vscode.TreeItemCollapsibleState.None);

        this.description = commentCount && commentCount > 0
            ? `${change.item.path}  💬 ${commentCount}`
            : change.item.path;
        this.tooltip = commentCount && commentCount > 0
            ? `${change.changeType}: ${change.item.path} — ${commentCount} unresolved comment${commentCount === 1 ? '' : 's'}`
            : `${change.changeType}: ${change.item.path}`;
        this.contextValue = 'prFile';

        // Icon based on change type
        switch (change.changeType) {
            case 'add':
                this.iconPath = new vscode.ThemeIcon('diff-added', new vscode.ThemeColor('gitDecoration.addedResourceForeground'));
                break;
            case 'delete':
                this.iconPath = new vscode.ThemeIcon('diff-removed', new vscode.ThemeColor('gitDecoration.deletedResourceForeground'));
                break;
            case 'rename':
                this.iconPath = new vscode.ThemeIcon('diff-renamed', new vscode.ThemeColor('gitDecoration.renamedResourceForeground'));
                break;
            default: // edit
                this.iconPath = new vscode.ThemeIcon('diff-modified', new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'));
                break;
        }

        // Command to open diff
        this.command = {
            command: 'azureDevops.openPrFileDiff',
            title: 'Open Diff',
            arguments: [this],
        };
    }
}

export class PrChangesProvider implements vscode.TreeDataProvider<PrFileItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<PrFileItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private selectedPr?: EnrichedPullRequest;
    private selectedOrg?: string;
    private secretStorage: vscode.SecretStorage;

    constructor(secretStorage: vscode.SecretStorage) {
        this.secretStorage = secretStorage;
    }

    selectPr(pr: EnrichedPullRequest, org: string): void {
        this.selectedPr = pr;
        this.selectedOrg = org;
        this._onDidChangeTreeData.fire();
    }

    clear(): void {
        this.selectedPr = undefined;
        this.selectedOrg = undefined;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: PrFileItem): vscode.TreeItem {
        return element;
    }

    async getChildren(): Promise<PrFileItem[]> {
        if (!this.selectedPr || !this.selectedOrg) {
            return [];
        }

        const token = await getToken(this.secretStorage);
        if (!token) { return []; }

        const pr = this.selectedPr;
        const org = this.selectedOrg;
        const project = pr.repository?.project?.name ?? '';
        const repoId = pr.repository?.id ?? '';

        try {
            const iterations = await getPrIterations(org, project, repoId, pr.pullRequestId, token);
            if (iterations.length === 0) { return []; }

            const lastIteration = iterations[iterations.length - 1];
            const changes = await getPrChanges(org, project, repoId, pr.pullRequestId, lastIteration.id, token);

            const sourceCommitId = lastIteration.sourceRefCommit?.commitId ?? '';
            const targetCommitId = lastIteration.targetRefCommit?.commitId ?? '';

            // Build a map of file path → unresolved comment count from the enriched PR data
            const fileCommentCounts = this.buildFileCommentCounts(pr.commentThreads ?? []);

            return changes
                .filter(c => c.item?.path)
                .map(c => new PrFileItem(
                    c, org, project, repoId, sourceCommitId, targetCommitId, pr.pullRequestId,
                    fileCommentCounts.get(c.item.path),
                ));
        } catch (e: any) {
            vscode.window.showErrorMessage(`Failed to load PR changes: ${e.message}`);
            return [];
        }
    }

    private buildFileCommentCounts(threads: PrThreadSummary[]): Map<string, number> {
        const counts = new Map<string, number>();
        for (const thread of threads) {
            if (thread.filePath && thread.status === 'active') {
                counts.set(thread.filePath, (counts.get(thread.filePath) ?? 0) + 1);
            }
        }
        return counts;
    }
}
