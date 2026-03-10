import * as vscode from 'vscode';
import { readFile, writeFile, unlink } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { getDevOpsConfig, getBaseUrl, getWorkItemProject } from '../config';
import { getCurrentBranch, getDefaultBranch, getRepositoryRoot } from '../git';
import { getWorkItemId } from '../workItem';
import { getToken } from '../auth';
import { createPullRequestApi, getRepositoryId, getUserId, setAutoComplete, updateWorkItemState } from '../api';

async function getPullRequestTemplate(): Promise<string | undefined> {
    const repoRoot = await getRepositoryRoot();
    if (!repoRoot) {
        return undefined;
    }

    const templatePaths = [
        '.azuredevops/pull_request_template.md',
        '.azuredevops/PULL_REQUEST_TEMPLATE.md',
        '.azuredevops/pull_request_template.txt',
        'pull_request_template.md',
        'PULL_REQUEST_TEMPLATE.md',
    ];

    for (const templatePath of templatePaths) {
        try {
            const content = await readFile(path.join(repoRoot, templatePath), 'utf-8');
            if (content.trim()) {
                return content;
            }
        } catch {
            // Try next candidate.
        }
    }

    return undefined;
}

async function editPullRequestDescription(template?: string): Promise<string> {
    if (!template) {
        return '';
    }

    const tmpPath = path.join(os.tmpdir(), `pr-description-${Date.now()}.md`);
    await writeFile(tmpPath, template, 'utf-8');

    const tmpUri = vscode.Uri.file(tmpPath);
    const doc = await vscode.workspace.openTextDocument(tmpUri);
    await vscode.window.showTextDocument(doc);

    vscode.window.showInformationMessage(
        'Edit the PR description, then close the tab to submit. Clear all text to skip.'
    );

    let latestContent = template;

    // Auto-save on changes so closing the tab never prompts to save
    const changeDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.fsPath === tmpPath && e.contentChanges.length > 0) {
            latestContent = e.document.getText();
            e.document.save();
        }
    });

    // Use tabGroups.onDidChangeTabs for reliable tab-close detection
    // (onDidCloseTextDocument is not guaranteed to fire on tab close)
    return new Promise<string>((resolve) => {
        const tabDisposable = vscode.window.tabGroups.onDidChangeTabs(async (e) => {
            for (const tab of e.closed) {
                if (tab.input instanceof vscode.TabInputText && tab.input.uri.fsPath === tmpPath) {
                    tabDisposable.dispose();
                    changeDisposable.dispose();
                    resolve(latestContent.trim() || '');
                    await unlink(tmpPath).catch(() => {});
                    return;
                }
            }
        });
    });
}

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

        const template = await getPullRequestTemplate();
        const description = await editPullRequestDescription(template);

        // Create via API
        const pr = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Creating pull request...' },
            async () => {
                const repoId = await getRepositoryId(config.organization, config.project, config.repository, token);

                const result = await createPullRequestApi({
                    org: config.organization,
                    project: config.project,
                    repoId,
                    sourceRefName: `refs/heads/${branch}`,
                    targetRefName: `refs/heads/${targetBranch}`,
                    title,
                    description,
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
                            `PR created, but failed to set linked work item #${parsedWorkItemId} state to "${workItemState}": ${error instanceof Error ? error.message : error}`
                        );
                    }
                }

                const settings = vscode.workspace.getConfiguration('azureDevops');
                if (settings.get<boolean>('pullRequestAutoComplete', false) && !isDraft.value) {
                    try {
                        const userId = await getUserId(config.organization, token);
                        await setAutoComplete(
                            config.organization,
                            config.project,
                            repoId,
                            result.pullRequestId,
                            userId,
                            {
                                mergeStrategy: settings.get<'squash'>('pullRequestMergeStrategy', 'squash'),
                                deleteSourceBranch: settings.get<boolean>('pullRequestDeleteSourceBranch', true),
                                completeWorkItems: settings.get<boolean>('pullRequestCompleteWorkItems', true),
                            },
                            token
                        );
                    } catch (error) {
                        vscode.window.showWarningMessage(
                            `PR created, but failed to set auto-complete: ${error instanceof Error ? error.message : error}`
                        );
                    }
                }

                return result;
            }
        );

        const prUrl = `${getBaseUrl(config)}/pullrequest/${pr.pullRequestId}`;
        const action = await vscode.window.showInformationMessage(
            `PR #${pr.pullRequestId} created.`,
            'Open in Browser'
        );
        if (action === 'Open in Browser') {
            await vscode.env.openExternal(vscode.Uri.parse(prUrl));
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create pull request: ${error instanceof Error ? error.message : error}`);
    }
}
