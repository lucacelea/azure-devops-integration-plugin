import * as vscode from 'vscode';
import { createPullRequest } from './commands/createPr';
import { openRepository } from './commands/openRepo';
import { openWorkItem } from './commands/openWorkItem';
import { setToken, removeToken, loginWithAzureAd, logoutFromAzureAd } from './auth';
import { createTaskForPr } from './commands/createTask';
import { createStatusBarItem } from './statusBar';
import { registerPrSidebar, PrFilter, PrSort } from './prSidebar';
import { registerPrActions, registerEditorVoteCommands } from './commands/prActions';
import { checkoutPrBranch } from './commands/checkoutBranch';
import { editExistingPrDescription } from './commands/editPrDescription';
import { PrChangesProvider, PrFileItem, PrCommentThreadItem } from './prChangesProvider';
import { PrContentProvider, buildPrFileUri } from './prContentProvider';
import { PrCommentController } from './prComments';
import { PrCommentDocProvider, PR_COMMENT_SCHEME } from './prCommentDocProvider';
import { buildPullRequestThreadUrl } from './prLinks';

export function activate(context: vscode.ExtensionContext) {
    const secretStorage = context.secrets;

    // Register PR sidebar first (needed by token commands)
    const prProvider = registerPrSidebar(context, secretStorage);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevops.createPullRequest', () => createPullRequest(secretStorage)),
        vscode.commands.registerCommand('azureDevops.createTaskForPr', () => createTaskForPr(secretStorage)),
        vscode.commands.registerCommand('azureDevops.openRepository', openRepository),
        vscode.commands.registerCommand('azureDevops.openWorkItem', openWorkItem),
        vscode.commands.registerCommand('azureDevops.setToken', async () => {
            await setToken(secretStorage);
            prProvider.refresh();
        }),
        vscode.commands.registerCommand('azureDevops.removeToken', async () => {
            await removeToken(secretStorage);
            prProvider.refresh();
        }),
        vscode.commands.registerCommand('azureDevops.loginAzureAd', async () => {
            const ok = await loginWithAzureAd();
            if (ok) { prProvider.refresh(); }
        }),
        vscode.commands.registerCommand('azureDevops.logoutAzureAd', async () => {
            await logoutFromAzureAd();
            prProvider.refresh();
        }),
        vscode.commands.registerCommand('azureDevops.refreshPullRequests', () => prProvider.refresh()),
        vscode.commands.registerCommand('azureDevops.openCheckInBrowser', async (url: string) => {
            if (url) {
                await vscode.env.openExternal(vscode.Uri.parse(url));
            }
        }),
        vscode.commands.registerCommand('azureDevops.editPrDescription', (item?: any) => {
            return editExistingPrDescription(prProvider, item);
        }),
        vscode.commands.registerCommand('azureDevops.editPrDescriptionFromPicker', () => {
            return editExistingPrDescription(prProvider);
        }),
    );

    // Register PR quick actions (Phase 1)
    registerPrActions(context, prProvider);

    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevops.checkoutPrBranch', checkoutPrBranch),
    );

    // Filter & sort commands (Phase 5)
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevops.filterPullRequests', async () => {
            const options: Array<{ label: string; value: PrFilter; description?: string }> = [
                { label: 'All', value: 'all', description: 'Show all pull requests' },
                { label: 'Drafts', value: 'draft', description: 'Only draft PRs' },
                { label: 'Needs my vote', value: 'needsMyVote', description: 'PRs where I haven\'t voted' },
                { label: 'Has unresolved comments', value: 'hasComments', description: 'PRs with unresolved comments' },
                { label: 'Checks failing', value: 'checksFailing', description: 'PRs with failed checks' },
            ];
            const picked = await vscode.window.showQuickPick(options, {
                placeHolder: 'Filter pull requests...',
            });
            if (picked) {
                prProvider.setFilter(picked.value);
            }
        }),
        vscode.commands.registerCommand('azureDevops.sortPullRequests', async () => {
            const options: Array<{ label: string; value: PrSort; description?: string }> = [
                { label: 'Default', value: 'default', description: 'Server order' },
                { label: 'By title', value: 'title', description: 'Alphabetical by title' },
                { label: 'By comment count', value: 'commentCount', description: 'Most comments first' },
            ];
            const picked = await vscode.window.showQuickPick(options, {
                placeHolder: 'Sort pull requests...',
            });
            if (picked) {
                prProvider.setSort(picked.value);
            }
        }),
    );

    // PR content provider for diff viewing (Phase 2)
    const prContentProvider = new PrContentProvider(secretStorage);
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider('azuredevops-pr', prContentProvider)
    );

    // PR comment content provider — shows full discussion threads as markdown
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(PR_COMMENT_SCHEME, new PrCommentDocProvider())
    );

    // PR comment controller — shows Azure DevOps threads on diff views
    const prCommentController = new PrCommentController(secretStorage);
    prCommentController.loadExisting();
    context.subscriptions.push(
        prCommentController,
        prCommentController.onDidAddComment(() => prChangesProvider.refresh()),
        vscode.commands.registerCommand('azureDevops.replyToComment', (reply: vscode.CommentReply) => {
            return prCommentController.replyToThread(reply);
        }),
    );

    // PR changes tree view (includes file changes + discussion threads)
    const prChangesProvider = new PrChangesProvider(secretStorage);
    const prChangesTree = vscode.window.createTreeView('azureDevops.prChanges', {
        treeDataProvider: prChangesProvider,
    });
    context.subscriptions.push(prChangesTree);

    prProvider.setCommentNotificationHandlers({
        openComment: async ({ org, pr, thread }) => {
            prChangesProvider.selectPr(pr, org);
            prChangesTree.title = `Changes: #${pr.pullRequestId}`;
            await prChangesProvider.openThreadById(pr, org, thread.threadId);
        },
        openInDevOps: async ({ org, pr, thread }) => {
            const project = pr.repository?.project?.name ?? '';
            const repoName = pr.repository?.name ?? '';
            const url = buildPullRequestThreadUrl(org, project, repoName, pr.pullRequestId, thread.threadId);
            await vscode.env.openExternal(vscode.Uri.parse(url));
        },
    });

    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevops.reviewPrChanges', (item: any) => {
            if (item?.pr && item?.org) {
                prChangesProvider.selectPr(item.pr, item.org);
                prChangesTree.title = `Changes: #${item.pr.pullRequestId}`;
            }
        }),
        vscode.commands.registerCommand('azureDevops.clearPrChanges', () => {
            prChangesProvider.clear();
            prCommentController.clearAll();
            prChangesTree.title = 'PR Changes';
        }),
        vscode.commands.registerCommand('azureDevops.refreshPrChanges', () => {
            prChangesProvider.refresh();
            prCommentController.refreshAll();
        }),
        vscode.commands.registerCommand('azureDevops.openDiscussionComment', (item: PrCommentThreadItem) => {
            return prChangesProvider.openComment(item);
        }),
        vscode.commands.registerCommand('azureDevops.replyToDiscussionThread', (item: PrCommentThreadItem) => {
            return prChangesProvider.replyToDiscussionThread(item);
        }),
        vscode.commands.registerCommand('azureDevops.resolveThread', (item: PrCommentThreadItem) => {
            return prChangesProvider.changeThreadStatus(item, 'fixed').then(() => prCommentController.refreshAll());
        }),
        vscode.commands.registerCommand('azureDevops.wontFixThread', (item: PrCommentThreadItem) => {
            return prChangesProvider.changeThreadStatus(item, 'wontFix').then(() => prCommentController.refreshAll());
        }),
        vscode.commands.registerCommand('azureDevops.byDesignThread', (item: PrCommentThreadItem) => {
            return prChangesProvider.changeThreadStatus(item, 'byDesign').then(() => prCommentController.refreshAll());
        }),
        vscode.commands.registerCommand('azureDevops.reactivateThread', (item: PrCommentThreadItem) => {
            return prChangesProvider.changeThreadStatus(item, 'active').then(() => prCommentController.refreshAll());
        }),
        vscode.commands.registerCommand('azureDevops.addGeneralComment', () => {
            return prChangesProvider.addGeneralComment();
        }),
        vscode.commands.registerCommand('azureDevops.openPrFileDiff', async (fileItem: PrFileItem) => {
            const change = fileItem.change;
            const filePath = change.item.path;

            if (change.changeType === 'add') {
                const rightUri = buildPrFileUri(fileItem.org, fileItem.project, fileItem.repoId, fileItem.sourceCommitId, filePath, fileItem.prId, 'right');
                const leftUri = vscode.Uri.parse('azuredevops-pr://empty');
                await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, `${filePath} (added)`);
            } else if (change.changeType === 'delete') {
                const leftUri = buildPrFileUri(fileItem.org, fileItem.project, fileItem.repoId, fileItem.targetCommitId, filePath, fileItem.prId, 'left');
                const rightUri = vscode.Uri.parse('azuredevops-pr://empty');
                await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, `${filePath} (deleted)`);
            } else {
                const originalPath = change.originalPath ?? filePath;
                const leftUri = buildPrFileUri(fileItem.org, fileItem.project, fileItem.repoId, fileItem.targetCommitId, originalPath, fileItem.prId, 'left');
                const rightUri = buildPrFileUri(fileItem.org, fileItem.project, fileItem.repoId, fileItem.sourceCommitId, filePath, fileItem.prId, 'right');
                await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, `${filePath}`);
            }
        }),
    );

    // Register editor-title vote commands (approve/reject/wait from diff view)
    registerEditorVoteCommands(context, prProvider);

    // Track when a PR diff editor is active to show editor/title vote buttons.
    // The 'empty' authority is used for placeholder (empty-file) side of diffs and should be excluded.
    function updatePrDiffContext() {
        const editor = vscode.window.activeTextEditor;
        const isPrDiff = editor?.document.uri.scheme === 'azuredevops-pr'
            && editor.document.uri.authority !== 'empty';
        vscode.commands.executeCommand('setContext', 'azureDevops.prDiffActive', !!isPrDiff);
    }
    updatePrDiffContext();
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => updatePrDiffContext()),
    );

    createStatusBarItem(context);
}

export function deactivate() {}
