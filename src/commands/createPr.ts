import * as vscode from 'vscode';
import { getDevOpsConfig, getBaseUrl, getWorkItemProject } from '../config';
import { getCurrentBranch, getDefaultBranch } from '../git';
import { getWorkItemId } from '../workItem';
import { getToken } from '../auth';
import { createPullRequestApi, getRepositoryId, updateWorkItemState } from '../api';

export async function createPullRequest(secretStorage: vscode.SecretStorage): Promise<void> {
    try {
        let config;
        try {
            config = await getDevOpsConfig();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to get Azure DevOps configuration: ${error instanceof Error ? error.message : error}`);
            return;
        }

        const token = await getToken(secretStorage);
        if (!token) {
            vscode.window.showErrorMessage('No PAT configured. Please set your Personal Access Token first.');
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

        // Gather PR details
        const workItemId = await getWorkItemId();
        const parsedWorkItemId = workItemId ? parseInt(workItemId, 10) : undefined;
        const hasValidWorkItemId = parsedWorkItemId !== undefined && !Number.isNaN(parsedWorkItemId);
        const workItemState = vscode.workspace
            .getConfiguration('azureDevops')
            .get<string>('pullRequestLinkedWorkItemState', '')
            .trim();

        const defaultTitle = branch
            .replace(/^(?:feature|bugfix|hotfix|fix|task|chore)\//, '')
            .replace(/^\d+[-_]?/, hasValidWorkItemId ? `AB#${parsedWorkItemId} ` : '')
            .replace(/[-_]/g, ' ')
            .trim();

        const title = await vscode.window.showInputBox({
            prompt: 'Pull request title',
            value: defaultTitle || branch,
        });
        if (!title) { return; }

        const targetBranch = await vscode.window.showInputBox({
            prompt: 'Target branch',
            value: defaultBranch,
        });
        if (!targetBranch) { return; }

        const isDraft = await vscode.window.showQuickPick(
            [{ label: 'No', value: false }, { label: 'Yes', value: true }],
            { placeHolder: 'Create as draft?' }
        );
        if (!isDraft) { return; }

        // Create via API
        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Creating pull request...' },
            async () => {
                const repoId = await getRepositoryId(config.organization, config.project, config.repository, token);

                const pr = await createPullRequestApi({
                    org: config.organization,
                    project: config.project,
                    repoId,
                    sourceRefName: `refs/heads/${branch}`,
                    targetRefName: `refs/heads/${targetBranch}`,
                    title,
                    workItemIds: hasValidWorkItemId ? [parsedWorkItemId] : undefined,
                    isDraft: isDraft.value,
                    token,
                });

                if (hasValidWorkItemId && workItemState) {
                    try {
                        const workItemProject = await getWorkItemProject();
                        await updateWorkItemState(
                            config.organization,
                            workItemProject,
                            parsedWorkItemId,
                            workItemState,
                            token
                        );
                    } catch (error) {
                        vscode.window.showWarningMessage(
                            `PR created, but failed to set linked work item #${workItemId} state to "${workItemState}": ${error instanceof Error ? error.message : error}`
                        );
                    }
                }

                const prUrl = `${getBaseUrl(config)}/pullrequest/${pr.pullRequestId}`;
                const action = await vscode.window.showInformationMessage(
                    `PR #${pr.pullRequestId} created.`,
                    'Open in Browser'
                );
                if (action === 'Open in Browser') {
                    await vscode.env.openExternal(vscode.Uri.parse(prUrl));
                }
            }
        );
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create pull request: ${error instanceof Error ? error.message : error}`);
    }
}
