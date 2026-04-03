import * as vscode from 'vscode';
import { PrThread, getPrThreads, addPullRequestFileComment, replyToThread } from './api';
import { parsePrFileUri } from './prContentProvider';
import { getAuthenticationRequiredMessage, getToken } from './auth';

interface ThreadMeta {
    org: string;
    project: string;
    repoId: string;
    prId: number;
    threadId: number;
}

export class PrCommentController implements vscode.Disposable {
    private readonly controller: vscode.CommentController;
    private readonly secretStorage: vscode.SecretStorage;
    private readonly vsThreads = new Map<string, vscode.CommentThread[]>();
    private readonly apiData = new Map<string, PrThread[]>();
    private readonly loadingKeys = new Set<string>();
    private readonly placedThreadIds = new Set<string>();
    private readonly disposables: vscode.Disposable[] = [];
    private readonly threadMeta = new WeakMap<vscode.CommentThread, ThreadMeta>();

    private readonly _onDidAddComment = new vscode.EventEmitter<void>();
    readonly onDidAddComment = this._onDidAddComment.event;

    constructor(secretStorage: vscode.SecretStorage) {
        this.secretStorage = secretStorage;
        this.controller = vscode.comments.createCommentController(
            'azureDevopsPrComments',
            'Azure DevOps PR Comments'
        );
        this.controller.commentingRangeProvider = {
            provideCommentingRanges: (document: vscode.TextDocument) => {
                const ctx = parsePrFileUri(document.uri);
                if (!ctx?.prId || ctx.side === 'left') {
                    return [];
                }
                return [new vscode.Range(0, 0, document.lineCount - 1, 0)];
            },
        };

        this.disposables.push(
            vscode.workspace.onDidOpenTextDocument((doc) => this.onDocumentOpen(doc))
        );
    }

    /** Call after construction to load comments for already-open documents. */
    loadExisting(): void {
        for (const doc of vscode.workspace.textDocuments) {
            this.onDocumentOpen(doc);
        }
    }

    private async onDocumentOpen(doc: vscode.TextDocument): Promise<void> {
        const ctx = parsePrFileUri(doc.uri);
        if (!ctx?.prId) { return; }

        const cacheKey = `${ctx.org}/${ctx.project}/${ctx.repoId}/${ctx.prId}`;

        if (this.apiData.has(cacheKey)) {
            // API data already fetched — just place threads for this newly opened doc
            this.placeThreadsForOpenDocs(cacheKey, ctx.org, ctx.project, ctx.repoId, ctx.prId);
            return;
        }

        await this.loadThreads(ctx.org, ctx.project, ctx.repoId, ctx.prId);
    }

    async loadThreads(org: string, project: string, repoId: string, prId: number): Promise<void> {
        const cacheKey = `${org}/${project}/${repoId}/${prId}`;

        // Prevent concurrent loads for the same PR
        if (this.loadingKeys.has(cacheKey) || this.apiData.has(cacheKey)) {
            return;
        }
        this.loadingKeys.add(cacheKey);

        try {
            const token = await getToken(this.secretStorage);
            if (!token) { return; }

            const apiThreads = await getPrThreads(org, project, repoId, prId, token);
            this.apiData.set(cacheKey, apiThreads);
            this.placeThreadsForOpenDocs(cacheKey, org, project, repoId, prId);
        } catch {
            // silently fail
        } finally {
            this.loadingKeys.delete(cacheKey);
        }
    }

    private placeThreadsForOpenDocs(
        cacheKey: string, org: string, project: string, repoId: string, prId: number
    ): void {
        const apiThreads = this.apiData.get(cacheKey);
        if (!apiThreads) { return; }

        for (const thread of apiThreads) {
            const threadKey = `${cacheKey}/${thread.id}`;
            if (this.placedThreadIds.has(threadKey)) { continue; }
            if (thread.isDeleted) { continue; }

            const userComments = thread.comments.filter(
                (c) => !c.isDeleted && c.commentType !== 'system'
            );
            if (userComments.length === 0) { continue; }

            const vsThread = thread.threadContext?.filePath
                ? this.placeFileThread(thread, userComments, org, project, repoId, prId)
                : undefined;

            if (vsThread) {
                this.placedThreadIds.add(threadKey);
                const existing = this.vsThreads.get(cacheKey) ?? [];
                existing.push(vsThread);
                this.vsThreads.set(cacheKey, existing);
            }
        }
    }

    private placeFileThread(
        thread: PrThread,
        userComments: PrThread['comments'],
        org: string, project: string, repoId: string, prId: number
    ): vscode.CommentThread | undefined {
        const ctx = thread.threadContext;
        if (!ctx) { return undefined; }

        const filePath = ctx.filePath;
        const isRight = !!ctx.rightFileStart;
        const startPos = isRight ? ctx.rightFileStart : ctx.leftFileStart;
        const endPos = isRight ? ctx.rightFileEnd : ctx.leftFileEnd;
        const startLine = startPos ? startPos.line - 1 : 0;
        const endLine = endPos ? endPos.line - 1 : startLine;
        const side = isRight ? 'right' : 'left';

        const matchingDoc = vscode.workspace.textDocuments.find((doc) => {
            const parsed = parsePrFileUri(doc.uri);
            return parsed?.org === org && parsed.repoId === repoId
                && parsed.prId === prId && parsed.filePath === filePath
                && parsed.side === side;
        });
        if (!matchingDoc) { return undefined; }

        const meta = { org, project, repoId, prId, threadId: thread.id };
        return this.createVsThread(matchingDoc.uri, startLine, endLine, thread, userComments, meta);
    }

    private createVsThread(
        uri: vscode.Uri, startLine: number, endLine: number, thread: PrThread,
        userComments: PrThread['comments'], meta: ThreadMeta
    ): vscode.CommentThread {
        const comments: vscode.Comment[] = userComments.map((c) => ({
            body: new vscode.MarkdownString(c.content),
            mode: vscode.CommentMode.Preview,
            author: { name: c.author.displayName },
            timestamp: new Date(c.publishedDate),
        }));

        const range = new vscode.Range(startLine, 0, endLine, 0);
        const vsThread = this.controller.createCommentThread(uri, range, comments);
        vsThread.canReply = true;
        vsThread.label = thread.status === 'active' ? 'Active' : thread.status;
        vsThread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
        this.threadMeta.set(vsThread, meta);
        return vsThread;
    }

    async createThread(reply: vscode.CommentReply): Promise<void> {
        const uri = reply.thread.uri;
        const ctx = parsePrFileUri(uri);
        if (!ctx?.prId) { return; }

        const token = await getToken(this.secretStorage);
        if (!token) {
            vscode.window.showErrorMessage(getAuthenticationRequiredMessage());
            return;
        }

        const range = reply.thread.range;
        const startLine = (range?.start.line ?? 0) + 1;
        const endLine = (range?.end.line ?? range?.start.line ?? 0) + 1;
        const isRight = ctx.side !== 'left';
        const startPosition = { line: startLine, offset: 1 };
        const endPosition = { line: endLine, offset: 1 };

        try {
            const result = await addPullRequestFileComment(
                ctx.org, ctx.project, ctx.repoId, ctx.prId,
                reply.text,
                {
                    filePath: ctx.filePath,
                    ...(isRight
                        ? { rightFileStart: startPosition, rightFileEnd: endPosition }
                        : { leftFileStart: startPosition, leftFileEnd: endPosition }),
                },
                token
            );

            reply.thread.comments = [
                ...reply.thread.comments,
                {
                    body: new vscode.MarkdownString(reply.text),
                    mode: vscode.CommentMode.Preview,
                    author: { name: 'You' },
                    timestamp: new Date(),
                },
            ];
            reply.thread.canReply = true;
            reply.thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;

            this.threadMeta.set(reply.thread, {
                org: ctx.org, project: ctx.project, repoId: ctx.repoId,
                prId: ctx.prId, threadId: result.id,
            });

            const cacheKey = `${ctx.org}/${ctx.project}/${ctx.repoId}/${ctx.prId}`;
            const existing = this.vsThreads.get(cacheKey) ?? [];
            existing.push(reply.thread);
            this.vsThreads.set(cacheKey, existing);
            this._onDidAddComment.fire();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to add comment: ${msg}`);
        }
    }

    async replyToThread(reply: vscode.CommentReply): Promise<void> {
        const meta = this.threadMeta.get(reply.thread);
        if (!meta) {
            await this.createThread(reply);
            return;
        }

        const token = await getToken(this.secretStorage);
        if (!token) {
            vscode.window.showErrorMessage(getAuthenticationRequiredMessage());
            return;
        }

        try {
            await replyToThread(
                meta.org, meta.project, meta.repoId, meta.prId,
                meta.threadId, reply.text, token
            );

            reply.thread.comments = [
                ...reply.thread.comments,
                {
                    body: new vscode.MarkdownString(reply.text),
                    mode: vscode.CommentMode.Preview,
                    author: { name: 'You' },
                    timestamp: new Date(),
                },
            ];
            this._onDidAddComment.fire();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to reply: ${msg}`);
        }
    }

    refreshAll(): void {
        // Clear everything and re-load for currently open documents
        this.clearAll();
        this.loadExisting();
    }

    clearAll(): void {
        for (const threads of this.vsThreads.values()) {
            for (const t of threads) { t.dispose(); }
        }
        this.vsThreads.clear();
        this.apiData.clear();
        this.placedThreadIds.clear();
    }

    dispose(): void {
        this.clearAll();
        this.controller.dispose();
        this._onDidAddComment.dispose();
        for (const d of this.disposables) { d.dispose(); }
    }
}
