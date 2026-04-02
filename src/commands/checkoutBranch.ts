import * as vscode from 'vscode';
import { PullRequestItem } from '../prSidebar';
import { exec } from 'child_process';
import { getActiveWorkspaceFolder } from '../repoSelector';

function runGit(command: string, cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
        exec(command, { cwd, encoding: 'utf-8' }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || error.message));
            } else {
                resolve(stdout.trim());
            }
        });
    });
}

export async function checkoutPrBranch(item: PullRequestItem): Promise<void> {
    const pr = item.pr;
    if (!pr) {
        vscode.window.showErrorMessage('No pull request data available.');
        return;
    }

    const branch = pr.sourceRefName?.replace(/^refs\/heads\//, '');
    if (!branch) {
        vscode.window.showErrorMessage('No source branch found.');
        return;
    }

    const cwd = getActiveWorkspaceFolder()?.uri.fsPath;
    if (!cwd) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return;
    }

    try {
        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Checking out ${branch}...` },
            async () => {
                await runGit('git fetch origin', cwd);
                await runGit(`git checkout ${branch}`, cwd);
            }
        );
        vscode.window.showInformationMessage(`Checked out branch: ${branch}`);
    } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to checkout: ${e.message}`);
    }
}
