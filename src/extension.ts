import * as vscode from 'vscode';
import { createPullRequest } from './commands/createPr';
import { openRepository } from './commands/openRepo';
import { openWorkItem } from './commands/openWorkItem';
import { setToken, removeToken } from './auth';
import { createStatusBarItem } from './statusBar';
import { registerPrSidebar } from './prSidebar';

export function activate(context: vscode.ExtensionContext) {
    const secretStorage = context.secrets;

    // Register PR sidebar first (needed by token commands)
    const prProvider = registerPrSidebar(context, secretStorage);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('azureDevops.createPullRequest', createPullRequest),
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

    // Create status bar item for work item ID
    createStatusBarItem(context);
}

export function deactivate() {}
