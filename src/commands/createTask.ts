import * as vscode from 'vscode';
import { getDevOpsConfig, getWorkItemProject } from '../config';
import { getToken } from '../auth';
import { getCurrentBranch } from '../git';
import {
    getCurrentIteration,
    getIterationWorkItems,
    createWorkItem,
    findPullRequestForBranch,
    linkWorkItemToPullRequest,
    getUserId,
    getRepositoryId,
    WorkItem,
} from '../api';

export async function createTaskForPr(
    secretStorage: vscode.SecretStorage,
): Promise<void> {
    try {
        let config;
        try {
            config = await getDevOpsConfig();
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to get Azure DevOps configuration: ${error instanceof Error ? error.message : error}`,
            );
            return;
        }

        const token = await getToken(secretStorage);
        if (!token) {
            vscode.window.showErrorMessage(
                'No PAT configured. Please set your Personal Access Token first.',
            );
            return;
        }

        const project = await getWorkItemProject();
        const team = `${project} Team`;

        // Fetch current iteration
        const iteration = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Fetching current sprint...',
            },
            () => getCurrentIteration(config.organization, project, team, token),
        );

        if (!iteration) {
            vscode.window.showErrorMessage(
                'Could not find the current sprint/iteration. Make sure your team has an active iteration configured.',
            );
            return;
        }

        // Fetch backlog items in the current sprint
        const workItems = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Fetching sprint work items...',
            },
            () => getIterationWorkItems(config.organization, project, iteration.path, token),
        );

        if (workItems.length === 0) {
            vscode.window.showErrorMessage(
                `No active backlog items found in sprint "${iteration.name}".`,
            );
            return;
        }

        // Show quick pick to select parent work item
        const quickPickItems = workItems.map((wi: WorkItem) => ({
            label: `#${wi.id} ${wi.title}`,
            description: `${wi.type} · ${wi.state}`,
            workItem: wi,
        }));

        const selected = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: `Select parent work item (Sprint: ${iteration.name})`,
        });

        if (!selected) {
            return;
        }

        // Prompt for task title
        const branch = await getCurrentBranch();
        const defaultTitle = branch ?? '';

        const taskTitle = await vscode.window.showInputBox({
            prompt: 'Task title',
            value: defaultTitle,
            validateInput: (v) => v.trim() ? null : 'Title is required',
        });

        if (!taskTitle) {
            return;
        }

        // Get current user for assignment
        const userId = await getUserId(config.organization, token);

        // Create the task
        const task = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Creating task...',
            },
            () =>
                createWorkItem({
                    org: config.organization,
                    project,
                    title: taskTitle,
                    iterationPath: iteration.path,
                    parentId: selected.workItem.id,
                    assignTo: userId,
                    token,
                }),
        );

        // Try to link the task to the current branch's PR
        let linked = false;
        try {
            if (branch) {
                const repoId = await getRepositoryId(
                    config.organization,
                    config.project,
                    config.repository,
                    token,
                );
                const pr = await findPullRequestForBranch(
                    config.organization,
                    config.project,
                    repoId,
                    branch,
                    token,
                );
                if (pr) {
                    const artifactUrl =
                        `vstfs:///Git/PullRequestId/${pr.repository.project.id}` +
                        `%2F${pr.repository.id}%2F${pr.pullRequestId}`;
                    await linkWorkItemToPullRequest(
                        config.organization,
                        project,
                        task.id,
                        artifactUrl,
                        token,
                    );
                    linked = true;
                }
            }
        } catch {
            // Linking is best-effort; ignore failures
        }

        const taskUrl = `https://dev.azure.com/${encodeURIComponent(config.organization)}/${encodeURIComponent(project)}/_workitems/edit/${task.id}`;

        const message = linked
            ? `Task #${task.id} created and linked to PR.`
            : `Task #${task.id} created.`;

        const action = await vscode.window.showInformationMessage(message, 'Open in Browser');
        if (action === 'Open in Browser') {
            await vscode.env.openExternal(vscode.Uri.parse(taskUrl));
        }
    } catch (error) {
        vscode.window.showErrorMessage(
            `Failed to create task: ${error instanceof Error ? error.message : error}`,
        );
    }
}
