import * as vscode from 'vscode';
import { createPullRequest } from './commands/createPr';
import { openRepository } from './commands/openRepo';
import { openWorkItem } from './commands/openWorkItem';
import { setToken, removeToken, getToken } from './auth';
import { createStatusBarItem } from './statusBar';
import { registerPrSidebar, PrFilter, PrSort } from './prSidebar';
import { registerPrActions } from './commands/prActions';
import { checkoutPrBranch } from './commands/checkoutBranch';
import { PrChangesProvider, PrFileItem } from './prChangesProvider';
import { PrContentProvider, buildPrFileUri, parsePrFileUri } from './prContentProvider';
import { addPullRequestFileComment } from './api';

export function activate(context: vscode.ExtensionContext) {
    const secretStorage = context.secrets;

    // Register PR sidebar first (needed by token commands)
    const prProvider = registerPrSidebar(context, secretStorage);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevops.createPullRequest', () => createPullRequest(secretStorage)),
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
        vscode.commands.registerCommand('azureDevops.refreshPullRequests', () => prProvider.refresh()),
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

    // PR changes tree view (Phase 2)
    const prChangesProvider = new PrChangesProvider(secretStorage);
    const prChangesTree = vscode.window.createTreeView('azureDevops.prChanges', {
        treeDataProvider: prChangesProvider,
    });
    context.subscriptions.push(prChangesTree);

    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevops.reviewPrChanges', (item: any) => {
            if (item?.pr && item?.org) {
                prChangesProvider.selectPr(item.pr, item.org);
                prChangesTree.title = `Changes: #${item.pr.pullRequestId}`;
            }
        }),
        vscode.commands.registerCommand('azureDevops.clearPrChanges', () => {
            prChangesProvider.clear();
            prChangesTree.title = 'PR Changes';
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

    // Add comment from diff view
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevops.addDiffComment', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) { return; }

            const uri = editor.document.uri;
            const prContext = parsePrFileUri(uri);
            if (!prContext || prContext.prId === undefined) {
                vscode.window.showErrorMessage('This file is not part of a PR diff.');
                return;
            }

            const token = await getToken(secretStorage);
            if (!token) {
                vscode.window.showErrorMessage('No PAT configured.');
                return;
            }

            const selection = editor.selection;
            const startLine = selection.start.line + 1; // VS Code is 0-based, API is 1-based
            const endLine = selection.end.line + 1;
            const lineLabel = startLine === endLine ? `line ${startLine}` : `lines ${startLine}-${endLine}`;

            const comment = await vscode.window.showInputBox({
                prompt: `Add comment on ${prContext.filePath} (${lineLabel})`,
                placeHolder: 'Type your comment...',
            });
            if (!comment) { return; }

            const position = { line: startLine, offset: 1 };
            const endPosition = { line: endLine, offset: 1 };
            const isRight = prContext.side !== 'left';

            try {
                await addPullRequestFileComment(
                    prContext.org, prContext.project, prContext.repoId, prContext.prId,
                    comment,
                    {
                        filePath: prContext.filePath,
                        ...(isRight
                            ? { rightFileStart: position, rightFileEnd: endPosition }
                            : { leftFileStart: position, leftFileEnd: endPosition }),
                    },
                    token
                );
                vscode.window.showInformationMessage('Comment added to diff.');
            } catch (e: any) {
                vscode.window.showErrorMessage(`Failed to add comment: ${e.message}`);
            }
        }),
    );
    createStatusBarItem(context);
}

export function deactivate() {}
