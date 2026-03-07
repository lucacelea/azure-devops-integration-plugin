import * as vscode from 'vscode';
import { getWorkItemId } from './workItem';
import { getCurrentBranch } from './git';

const POLL_INTERVAL_MS = 5000;

export function createStatusBarItem(context: vscode.ExtensionContext): vscode.StatusBarItem {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'azureDevops.openWorkItem';

    let lastBranch: string | undefined;

    async function updateStatusBar(): Promise<void> {
        const id = await getWorkItemId();
        if (id) {
            statusBarItem.text = `$(tag) WI #${id}`;
            statusBarItem.tooltip = `Open work item #${id} in Azure DevOps`;
            statusBarItem.show();
        } else {
            statusBarItem.hide();
        }
    }

    async function pollBranchChange(): Promise<void> {
        const currentBranch = await getCurrentBranch();
        if (currentBranch !== lastBranch) {
            lastBranch = currentBranch;
            await updateStatusBar();
        }
    }

    // Initial update
    updateStatusBar();

    // Re-check on configuration changes
    const configDisposable = vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('azureDevops')) {
            updateStatusBar();
        }
    });

    // Poll for branch changes
    const intervalId = setInterval(pollBranchChange, POLL_INTERVAL_MS);
    const intervalDisposable = new vscode.Disposable(() => clearInterval(intervalId));

    context.subscriptions.push(statusBarItem, configDisposable, intervalDisposable);

    return statusBarItem;
}
