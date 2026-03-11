import * as vscode from 'vscode';
import { EnrichedPullRequest, PrThread, getPrThreads, getPrIterations, replyToThread, addPullRequestComment } from './api';
import { getToken } from './auth';
import { buildPrFileUri } from './prContentProvider';
import { setCommentContent, buildCommentDocUri, clearCommentContent } from './prCommentDocProvider';

type DiscussionTreeItem = PrDiscussionItem | PrDiscussionReplyItem;

export class PrDiscussionReplyItem extends vscode.TreeItem {
    constructor(
        public readonly author: string,
        public readonly content: string,
        public readonly date: string,
    ) {
        super(author, vscode.TreeItemCollapsibleState.None);
        const preview = content.replaceAll('\n', ' ').slice(0, 100);
        this.description = preview;
        this.tooltip = new vscode.MarkdownString(`**${author}**\n\n${content}`);
        this.iconPath = new vscode.ThemeIcon('comment');
    }
}

export class PrDiscussionItem extends vscode.TreeItem {
    public readonly replyItems: PrDiscussionReplyItem[];

    constructor(
        public readonly thread: PrThread,
        public readonly org: string,
        public readonly project: string,
        public readonly repoId: string,
        public readonly prId: number,
        public readonly sourceCommitId: string,
        public readonly targetCommitId: string,
    ) {
        const userComments = thread.comments.filter(
            (c) => !c.isDeleted && c.commentType !== 'system'
        );
        const firstComment = userComments[0];
        const author = firstComment?.author.displayName ?? 'Unknown';
        const preview = firstComment
            ? firstComment.content.replaceAll('\n', ' ').slice(0, 80)
            : '';

        const filePath = thread.threadContext?.filePath;
        const pos = thread.threadContext?.rightFileStart ?? thread.threadContext?.leftFileStart;
        const lineNum = pos?.line;
        const isGeneral = !filePath;

        const fileName = filePath ? filePath.split('/').pop() : undefined;
        const lineSuffix = lineNum ? `:${lineNum}` : '';
        const label = isGeneral ? 'General' : `${fileName}${lineSuffix}`;

        const hasReplies = userComments.length > 1;
        super(label, hasReplies
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None);

        this.description = `${author}: ${preview}`;

        const location = filePath ? `on \`${filePath}\`` : '(general PR comment)';
        const lineInfo = lineNum ? ` line ${lineNum}` : '';
        const replyCount = userComments.length - 1;
        const replyInfo = replyCount > 0 ? `\n\n---\n*${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}*` : '';
        this.tooltip = new vscode.MarkdownString(
            `**${author}** ${location}${lineInfo}\n\n${firstComment?.content ?? ''}${replyInfo}`
        );

        // Build reply items for children
        this.replyItems = userComments.slice(1).map((c) =>
            new PrDiscussionReplyItem(c.author.displayName, c.content, c.publishedDate)
        );

        // Icon
        if (isGeneral) {
            this.iconPath = new vscode.ThemeIcon('megaphone', new vscode.ThemeColor('charts.blue'));
        } else {
            switch (thread.status) {
                case 'active':
                    this.iconPath = new vscode.ThemeIcon('comment-discussion', new vscode.ThemeColor('charts.yellow'));
                    break;
                case 'fixed':
                case 'closed':
                case 'wontFix':
                case 'byDesign':
                    this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
                    break;
                default:
                    this.iconPath = new vscode.ThemeIcon('comment');
                    break;
            }
        }

        this.contextValue = 'discussionThread';

        // Click to open the diff (file comments) or the full comment (general comments)
        if (isGeneral || (filePath && sourceCommitId && targetCommitId)) {
            this.command = {
                command: 'azureDevops.openDiscussionComment',
                title: 'Open Comment',
                arguments: [this],
            };
        }
    }
}

export class PrDiscussionProvider implements vscode.TreeDataProvider<DiscussionTreeItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private selectedPr?: EnrichedPullRequest;
    private selectedOrg?: string;
    private readonly secretStorage: vscode.SecretStorage;

    constructor(secretStorage: vscode.SecretStorage) {
        this.secretStorage = secretStorage;
    }

    selectPr(pr: EnrichedPullRequest, org: string): void {
        this.selectedPr = pr;
        this.selectedOrg = org;
        this._onDidChangeTreeData.fire();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    clear(): void {
        this.selectedPr = undefined;
        this.selectedOrg = undefined;
        clearCommentContent();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: DiscussionTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: DiscussionTreeItem): Promise<DiscussionTreeItem[]> | DiscussionTreeItem[] {
        if (element instanceof PrDiscussionItem) {
            return element.replyItems;
        }
        if (element instanceof PrDiscussionReplyItem) {
            return [];
        }
        return this.getRootItems();
    }

    private async getRootItems(): Promise<PrDiscussionItem[]> {
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
            const [threads, iterations] = await Promise.all([
                getPrThreads(org, project, repoId, pr.pullRequestId, token),
                getPrIterations(org, project, repoId, pr.pullRequestId, token),
            ]);

            const lastIteration = iterations.at(-1);
            const sourceCommitId = lastIteration?.sourceRefCommit?.commitId ?? '';
            const targetCommitId = lastIteration?.targetRefCommit?.commitId ?? '';

            return threads
                .filter((t) =>
                    !t.isDeleted &&
                    t.comments.some((c) => !c.isDeleted && c.commentType !== 'system')
                )
                .map((t) => new PrDiscussionItem(
                    t, org, project, repoId, pr.pullRequestId,
                    sourceCommitId, targetCommitId
                ));
        } catch {
            return [];
        }
    }

    /** Reply to a discussion thread via input box. */
    async replyToDiscussionThread(item: PrDiscussionItem): Promise<void> {
        const token = await getToken(this.secretStorage);
        if (!token || !this.selectedPr || !this.selectedOrg) { return; }

        const content = await vscode.window.showInputBox({
            prompt: 'Reply to this thread',
            placeHolder: 'Type your reply…',
        });
        if (!content) { return; }

        const pr = this.selectedPr;
        const org = this.selectedOrg;
        const project = pr.repository?.project?.name ?? '';
        const repoId = pr.repository?.id ?? '';

        await replyToThread(org, project, repoId, pr.pullRequestId, item.thread.id, content, token);
        this.refresh();
    }

    /** Add a new general (non-file) comment on the PR. */
    async addGeneralComment(): Promise<void> {
        const token = await getToken(this.secretStorage);
        if (!token || !this.selectedPr || !this.selectedOrg) {
            vscode.window.showWarningMessage('Select a PR first to add a comment.');
            return;
        }

        const content = await vscode.window.showInputBox({
            prompt: 'Add a general comment to this PR',
            placeHolder: 'Type your comment…',
        });
        if (!content) { return; }

        const pr = this.selectedPr;
        const org = this.selectedOrg;
        const project = pr.repository?.project?.name ?? '';
        const repoId = pr.repository?.id ?? '';

        await addPullRequestComment(org, project, repoId, pr.pullRequestId, content, token);
        this.refresh();
    }

    /** Open a diff at the comment's file and line, or show full text for general comments. */
    async openComment(item: PrDiscussionItem): Promise<void> {
        const ctx = item.thread.threadContext;
        if (!ctx?.filePath) {
            return this.showFullComment(item);
        }

        const filePath = ctx.filePath;
        const isRight = !!ctx.rightFileStart;
        const pos = ctx.rightFileStart ?? ctx.leftFileStart;
        const line = pos ? pos.line - 1 : 0;

        const leftUri = buildPrFileUri(
            item.org, item.project, item.repoId, item.targetCommitId, filePath, item.prId, 'left'
        );
        const rightUri = buildPrFileUri(
            item.org, item.project, item.repoId, item.sourceCommitId, filePath, item.prId, 'right'
        );

        await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, filePath);

        // After the diff opens, reveal the comment's line
        if (isRight) {
            // Small delay to let the diff editor initialize
            setTimeout(() => {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    const range = new vscode.Range(line, 0, line, 0);
                    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
                    editor.selection = new vscode.Selection(line, 0, line, 0);
                }
            }, 300);
        }
    }

    /** Open a read-only markdown document showing the full discussion thread. */
    private async showFullComment(item: PrDiscussionItem): Promise<void> {
        const userComments = item.thread.comments.filter(
            (c) => !c.isDeleted && c.commentType !== 'system'
        );
        if (userComments.length === 0) { return; }

        const lines: string[] = [];
        for (const comment of userComments) {
            lines.push(`**${comment.author.displayName}**`);
            lines.push('');
            lines.push(comment.content);
            lines.push('\n---\n');
        }
        // Remove trailing separator
        lines.pop();

        const markdown = lines.join('\n');
        setCommentContent(item.thread.id, markdown);

        const uri = buildCommentDocUri(item.thread.id);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: true });
    }
}
