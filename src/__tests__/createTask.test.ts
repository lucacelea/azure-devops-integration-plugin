import * as vscode from 'vscode';
import { createTaskForPr, formatBranchAsTitle } from '../commands/createTask';

jest.mock('../config', () => ({
    getDevOpsConfig: jest.fn().mockResolvedValue({
        organization: 'org',
        project: 'proj',
        repository: 'repo',
    }),
    getWorkItemProject: jest.fn().mockResolvedValue('proj'),
}));

jest.mock('../auth', () => ({
    getToken: jest.fn().mockResolvedValue('token'),
}));

jest.mock('../repoPicker', () => ({
    pickRepository: jest.fn().mockResolvedValue({
        folder: { uri: { fsPath: '/picked-repo' } },
        branch: 'feature/1234-my-task',
    }),
}));

jest.mock('../api', () => ({
    getCurrentIterations: jest.fn().mockResolvedValue([
        {
            id: 'iter-1',
            name: 'Sprint 5',
            path: 'proj\\Sprint 5',
        },
    ]),
    getTeamFieldValues: jest.fn().mockResolvedValue({
        referenceName: 'System.AreaPath',
        values: [{ value: 'proj\\Stackportal', includeChildren: true }],
    }),
    getIterationWorkItems: jest.fn().mockResolvedValue([
        { id: 100, title: 'User story one', state: 'Active', type: 'User Story' },
        { id: 200, title: 'Bug two', state: 'Active', type: 'Bug' },
    ]),
    createWorkItem: jest.fn().mockResolvedValue({ id: 999, url: 'https://dev.azure.com/org/proj/_workitems/edit/999' }),
    getCurrentUserAssignmentValue: jest.fn().mockResolvedValue('me@example.com'),
    getRepositoryId: jest.fn().mockResolvedValue('repo-id'),
    findPullRequestForBranch: jest.fn().mockResolvedValue(undefined),
    linkWorkItemToPullRequest: jest.fn(),
}));

const api = jest.requireMock('../api') as {
    getCurrentIterations: jest.Mock;
    getTeamFieldValues: jest.Mock;
    getIterationWorkItems: jest.Mock;
    createWorkItem: jest.Mock;
    getCurrentUserAssignmentValue: jest.Mock;
    getRepositoryId: jest.Mock;
    findPullRequestForBranch: jest.Mock;
    linkWorkItemToPullRequest: jest.Mock;
};

const auth = jest.requireMock('../auth') as {
    getToken: jest.Mock;
};

const config = jest.requireMock('../config') as {
    getDevOpsConfig: jest.Mock;
    getWorkItemProject: jest.Mock;
};

const repoPicker = jest.requireMock('../repoPicker') as {
    pickRepository: jest.Mock;
};

describe('createTaskForPr', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        (vscode.window.withProgress as jest.Mock).mockImplementation(
            async (_options: unknown, task: () => unknown) => await task(),
        );

        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn().mockImplementation((_key: string, defaultValue?: unknown) => defaultValue),
        });
    });

    it('shows an error when no PAT is configured', async () => {
        auth.getToken.mockResolvedValueOnce(undefined);

        await createTaskForPr({} as vscode.SecretStorage);

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            'No PAT configured. Please set your Personal Access Token first.',
        );
        expect(api.createWorkItem).not.toHaveBeenCalled();
    });

    it('shows an error when config resolution fails', async () => {
        config.getDevOpsConfig.mockRejectedValueOnce(new Error('missing org'));

        await createTaskForPr({} as vscode.SecretStorage);

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            expect.stringContaining('missing org'),
        );
        expect(api.createWorkItem).not.toHaveBeenCalled();
    });

    it('shows an error when no current iteration is found', async () => {
        api.getCurrentIterations.mockResolvedValueOnce([]);

        await createTaskForPr({} as vscode.SecretStorage);

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            expect.stringContaining('current sprint/iteration'),
        );
        expect(api.createWorkItem).not.toHaveBeenCalled();
    });

    it('shows an error when no work items are in the sprint', async () => {
        api.getIterationWorkItems.mockResolvedValueOnce([]);

        await createTaskForPr({} as vscode.SecretStorage);

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            expect.stringContaining('No active backlog items'),
        );
        expect(api.createWorkItem).not.toHaveBeenCalled();
    });

    it('stops when user cancels parent selection', async () => {
        (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce(undefined);

        await createTaskForPr({} as vscode.SecretStorage);

        expect(api.createWorkItem).not.toHaveBeenCalled();
    });

    it('stops when user cancels title input', async () => {
        (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce({
            label: '#100 User story one',
            description: 'User Story · Active',
            workItem: { id: 100, title: 'User story one', state: 'Active', type: 'User Story' },
        });
        (vscode.window.showInputBox as jest.Mock).mockResolvedValueOnce(undefined);

        await createTaskForPr({} as vscode.SecretStorage);

        expect(api.createWorkItem).not.toHaveBeenCalled();
    });

    it('creates a task under the selected parent work item', async () => {
        (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce({
            label: '#100 User story one',
            description: 'User Story · Active',
            workItem: { id: 100, title: 'User story one', state: 'Active', type: 'User Story' },
        });
        (vscode.window.showInputBox as jest.Mock).mockResolvedValueOnce('My new task');
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce(undefined);

        await createTaskForPr({} as vscode.SecretStorage);

        expect(config.getDevOpsConfig).toHaveBeenCalledWith('/picked-repo');
        expect(config.getWorkItemProject).toHaveBeenCalledWith('/picked-repo');
        expect(api.getIterationWorkItems).toHaveBeenCalledWith(
            'org',
            'proj',
            'proj\\Sprint 5',
            'token',
            {
                referenceName: 'System.AreaPath',
                values: [{ value: 'proj\\Stackportal', includeChildren: true }],
            },
        );
        expect(api.createWorkItem).toHaveBeenCalledWith({
            org: 'org',
            project: 'proj',
            title: 'My new task',
            iterationPath: 'proj\\Sprint 5',
            parentId: 100,
            state: undefined,
            assignTo: 'me@example.com',
            token: 'token',
        });
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            'Task #999 created.',
            'Open in Browser',
        );
    });

    it('applies the configured task state when creating a task', async () => {
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn().mockImplementation((key: string, defaultValue?: unknown) => {
                if (key === 'taskState') { return 'Active'; }
                return defaultValue;
            }),
        });
        (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce({
            label: '#100 User story one',
            description: 'User Story · Active',
            workItem: { id: 100, title: 'User story one', state: 'Active', type: 'User Story' },
        });
        (vscode.window.showInputBox as jest.Mock).mockResolvedValueOnce('My new task');
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce(undefined);

        await createTaskForPr({} as vscode.SecretStorage);

        expect(api.createWorkItem).toHaveBeenCalledWith(expect.objectContaining({
            state: 'Active',
        }));
    });

    it('lets the user choose a sprint when multiple current iterations are returned', async () => {
        api.getCurrentIterations.mockResolvedValueOnce([
            { id: 'iter-1', name: 'Sprint 5', path: 'proj\\Sprint 5' },
            { id: 'iter-2', name: 'Sprint 6', path: 'proj\\Sprint 6' },
        ]);
        (vscode.window.showQuickPick as jest.Mock)
            .mockResolvedValueOnce({
                label: 'Sprint 6',
                description: 'proj\\Sprint 6',
                iteration: { id: 'iter-2', name: 'Sprint 6', path: 'proj\\Sprint 6' },
            })
            .mockResolvedValueOnce({
                label: '#100 User story one',
                description: 'User Story · Active',
                workItem: { id: 100, title: 'User story one', state: 'Active', type: 'User Story' },
            });
        (vscode.window.showInputBox as jest.Mock).mockResolvedValueOnce('My new task');
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce(undefined);

        await createTaskForPr({} as vscode.SecretStorage);

        expect(api.getIterationWorkItems).toHaveBeenCalledWith(
            'org',
            'proj',
            'proj\\Sprint 6',
            'token',
            {
                referenceName: 'System.AreaPath',
                values: [{ value: 'proj\\Stackportal', includeChildren: true }],
            },
        );
        expect(api.createWorkItem).toHaveBeenCalledWith(expect.objectContaining({
            iterationPath: 'proj\\Sprint 6',
        }));
    });

    it('stops when the user cancels sprint selection for multiple current iterations', async () => {
        api.getCurrentIterations.mockResolvedValueOnce([
            { id: 'iter-1', name: 'Sprint 5', path: 'proj\\Sprint 5' },
            { id: 'iter-2', name: 'Sprint 6', path: 'proj\\Sprint 6' },
        ]);
        (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce(undefined);

        await createTaskForPr({} as vscode.SecretStorage);

        expect(api.getIterationWorkItems).not.toHaveBeenCalled();
        expect(api.createWorkItem).not.toHaveBeenCalled();
    });

    it('links the task to a PR when one exists for the current branch', async () => {
        api.findPullRequestForBranch.mockResolvedValueOnce({
            pullRequestId: 42,
            repository: {
                id: 'repo-id',
                project: { id: 'project-id', name: 'proj' },
            },
        });

        (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce({
            label: '#100 User story one',
            description: 'User Story · Active',
            workItem: { id: 100, title: 'User story one', state: 'Active', type: 'User Story' },
        });
        (vscode.window.showInputBox as jest.Mock).mockResolvedValueOnce('Task for PR');
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce(undefined);

        await createTaskForPr({} as vscode.SecretStorage);

        expect(api.linkWorkItemToPullRequest).toHaveBeenCalledWith(
            'org',
            'proj',
            999,
            'vstfs:///Git/PullRequestId/project-id%2Frepo-id%2F42',
            'token',
        );
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            'Task #999 created and linked to PR.',
            'Open in Browser',
        );
    });

    it('still succeeds when PR linking fails', async () => {
        api.findPullRequestForBranch.mockRejectedValueOnce(new Error('network error'));

        (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce({
            label: '#200 Bug two',
            description: 'Bug · Active',
            workItem: { id: 200, title: 'Bug two', state: 'Active', type: 'Bug' },
        });
        (vscode.window.showInputBox as jest.Mock).mockResolvedValueOnce('Bug task');
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce(undefined);

        await createTaskForPr({} as vscode.SecretStorage);

        expect(api.createWorkItem).toHaveBeenCalled();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            'Task #999 created.',
            'Open in Browser',
        );
    });

    it('stops when the repository picker is cancelled', async () => {
        repoPicker.pickRepository.mockResolvedValueOnce(undefined);

        await createTaskForPr({} as vscode.SecretStorage);

        expect(config.getDevOpsConfig).not.toHaveBeenCalled();
        expect(api.createWorkItem).not.toHaveBeenCalled();
    });
});

describe('formatBranchAsTitle', () => {
    beforeEach(() => {
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn().mockImplementation((_key: string, defaultValue?: unknown) => defaultValue),
        });
    });

    it('returns empty string for undefined', () => {
        expect(formatBranchAsTitle(undefined)).toBe('');
    });

    it('strips feature/ prefix and formats dashes', () => {
        expect(formatBranchAsTitle('feature/add-login-page')).toBe('Add login page');
    });

    it('strips numeric work item ID prefix', () => {
        expect(formatBranchAsTitle('feature/1234-fix-login')).toBe('Fix login');
    });

    it('strips bugfix/ prefix', () => {
        expect(formatBranchAsTitle('bugfix/fix-null-ref')).toBe('Fix null ref');
    });

    it('handles plain branch names', () => {
        expect(formatBranchAsTitle('my-cool-branch')).toBe('My cool branch');
    });

    it('replaces underscores with spaces', () => {
        expect(formatBranchAsTitle('task/1234_update_tests')).toBe('Update tests');
    });

    it('strips configured branch prefix', () => {
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn().mockImplementation((key: string, defaultValue?: unknown) => {
                if (key === 'branchPrefix') { return 'lucac/'; }
                return defaultValue;
            }),
        });
        expect(formatBranchAsTitle('lucac/feature/my-work')).toBe('My work');
    });
});
