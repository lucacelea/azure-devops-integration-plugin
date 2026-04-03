import * as vscode from 'vscode';
import { getDevOpsConfig, getWorkItemProject } from '../config';
import { getToken } from '../auth';
import { pickRepository } from '../repoPicker';
import {
    getCurrentIterations,
    getTeamFieldValues,
    getIterationWorkItems,
    createWorkItem,
    findPullRequestForBranch,
    linkWorkItemToPullRequest,
    getCurrentUserAssignmentValue,
    getRepositoryId,
    Iteration,
    WorkItem,
} from '../api';

const BRANCH_TYPE_PREFIXES = /^(?:feature|bugfix|hotfix|fix|task|chore)\//;

export function formatBranchAsTitle(branch: string | undefined): string {
    if (!branch) {
        return '';
    }

    const branchPrefix = vscode.workspace.getConfiguration('azureDevops')
        .get<string>('branchPrefix', '');

    let subject = branch;
    if (branchPrefix && subject.startsWith(branchPrefix)) {
        subject = subject.slice(branchPrefix.length);
    }

    subject = subject.replace(BRANCH_TYPE_PREFIXES, '');
    subject = subject.replace(/^\d+[-_]/, '');
    subject = subject.replace(/[-_]/g, ' ');

    return subject.charAt(0).toUpperCase() + subject.slice(1);
}

async function pickIteration(iterations: Iteration[]): Promise<Iteration | undefined> {
    if (iterations.length === 0) {
        return undefined;
    }

    if (iterations.length === 1) {
        return iterations[0];
    }

    const picked = await vscode.window.showQuickPick(
        iterations.map((iteration) => ({
            label: iteration.name,
            description: iteration.path,
            iteration,
        })),
        {
            title: 'Choose a sprint',
            placeHolder: 'Azure DevOps returned multiple current iterations. Choose the sprint to use.',
        },
    );

    return picked?.iteration;
}

export async function createTaskForPr(
    secretStorage: vscode.SecretStorage,
): Promise<void> {
    try {
        const repo = await pickRepository();
        if (!repo) {
            return;
        }

        const cwd = repo.folder.uri.fsPath;
        const branch = repo.branch || undefined;

        let config;
        try {
            config = await getDevOpsConfig(cwd);
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

        const project = await getWorkItemProject(cwd);
        const azureDevopsConfig = vscode.workspace.getConfiguration('azureDevops');
        const team = azureDevopsConfig.get<string>('team', '') || `${project} Team`;
        const taskState = azureDevopsConfig.get<string>('taskState', '').trim();

        const [iterations, teamFieldValues] = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Fetching current sprint...',
            },
            () => Promise.all([
                getCurrentIterations(config.organization, project, team, token),
                getTeamFieldValues(config.organization, project, team, token),
            ]),
        );

        if (iterations.length === 0) {
            vscode.window.showErrorMessage(
                'Could not find the current sprint/iteration. Make sure your team has an active iteration configured.',
            );
            return;
        }

        const iteration = await pickIteration(iterations);
        if (!iteration) {
            return;
        }

        // Fetch backlog items in the current sprint
        const workItems = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Fetching sprint work items...',
            },
            () => getIterationWorkItems(config.organization, project, iteration.path, token, teamFieldValues),
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
        const defaultTitle = formatBranchAsTitle(branch);

        const taskTitle = await vscode.window.showInputBox({
            prompt: 'Task title',
            value: defaultTitle,
            validateInput: (v) => v.trim() ? null : 'Title is required',
        });

        if (!taskTitle) {
            return;
        }

        // Get current user for assignment
        const assignTo = await getCurrentUserAssignmentValue(config.organization, token);

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
                    state: taskState || undefined,
                    assignTo,
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
