import * as vscode from 'vscode';
import { getDevOpsConfig, getBaseUrl } from '../config';
import { getCurrentBranch, getDefaultBranch } from '../git';
import { getWorkItemId } from '../workItem';

export async function createPullRequest(): Promise<void> {
    try {
        let config;
        try {
            config = await getDevOpsConfig();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to get Azure DevOps configuration: ${error instanceof Error ? error.message : error}`);
            return;
        }

        const branch = await getCurrentBranch();
        if (!branch) {
            vscode.window.showErrorMessage('Could not determine the current Git branch.');
            return;
        }

        const defaultBranch = await getDefaultBranch();
        if (branch === defaultBranch) {
            const choice = await vscode.window.showWarningMessage(
                `You are currently on the default branch "${defaultBranch}". Are you sure you want to create a pull request?`,
                'Continue',
                'Cancel'
            );
            if (choice !== 'Continue') {
                return;
            }
        }

        let url = `${getBaseUrl(config)}/pullrequestcreate?sourceRef=${encodeURIComponent(branch)}`;

        const workItemId = await getWorkItemId();
        if (workItemId) {
            url += `&workItemIds=${workItemId}`;
        }

        await vscode.env.openExternal(vscode.Uri.parse(url));
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create pull request: ${error instanceof Error ? error.message : error}`);
    }
}
