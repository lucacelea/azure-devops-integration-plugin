import * as vscode from 'vscode';
import { PrCommentController } from '../prComments';

jest.mock('../auth', () => ({
    getToken: jest.fn(),
}));

jest.mock('../api', () => ({
    getPrThreads: jest.fn(),
    addPullRequestFileComment: jest.fn(),
    replyToThread: jest.fn(),
    updateThreadStatus: jest.fn(),
}));

jest.mock('../prContentProvider', () => ({
    parsePrFileUri: jest.fn(),
}));

const auth = jest.requireMock('../auth') as { getToken: jest.Mock };
const api = jest.requireMock('../api') as {
    getPrThreads: jest.Mock;
    updateThreadStatus: jest.Mock;
};

function makeController(): PrCommentController {
    return new PrCommentController({} as vscode.SecretStorage);
}

function makeMockThread(contextValue: string): vscode.CommentThread {
    return {
        uri: vscode.Uri.parse('azuredevops-pr://host/path'),
        range: new vscode.Range(0, 0, 0, 0),
        comments: [],
        canReply: true,
        label: contextValue === 'active' ? 'Active' : 'fixed',
        collapsibleState: vscode.CommentThreadCollapsibleState.Expanded,
        contextValue,
        state: contextValue === 'active'
            ? vscode.CommentThreadState.Unresolved
            : vscode.CommentThreadState.Resolved,
        dispose: jest.fn(),
    } as unknown as vscode.CommentThread;
}

describe('PrCommentController resolve/unresolve', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('resolveThread', () => {
        it('does nothing when thread has no metadata', async () => {
            const ctrl = makeController();
            const thread = makeMockThread('active');

            await ctrl.resolveThread(thread);

            expect(api.updateThreadStatus).not.toHaveBeenCalled();
        });

        it('shows error when no PAT configured', async () => {
            auth.getToken.mockResolvedValue(undefined);
            const ctrl = makeController();
            const thread = makeMockThread('active');

            // Use internal method to set metadata
            (ctrl as any).threadMeta.set(thread, {
                org: 'org', project: 'proj', repoId: 'repo1',
                prId: 42, threadId: 7,
            });

            await ctrl.resolveThread(thread);

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('No PAT configured.');
            expect(api.updateThreadStatus).not.toHaveBeenCalled();
        });

        it('resolves an active thread and updates visual state', async () => {
            auth.getToken.mockResolvedValue('test-token');
            api.updateThreadStatus.mockResolvedValue(undefined);

            const ctrl = makeController();
            const thread = makeMockThread('active');

            (ctrl as any).threadMeta.set(thread, {
                org: 'org', project: 'proj', repoId: 'repo1',
                prId: 42, threadId: 7,
            });

            await ctrl.resolveThread(thread);

            expect(api.updateThreadStatus).toHaveBeenCalledWith(
                'org', 'proj', 'repo1', 42, 7, 'fixed', 'test-token'
            );
            expect(thread.contextValue).toBe('resolved');
            expect(thread.state).toBe(vscode.CommentThreadState.Resolved);
            expect(thread.label).toBe('fixed');
            expect(thread.collapsibleState).toBe(vscode.CommentThreadCollapsibleState.Collapsed);
        });

        it('shows error on API failure', async () => {
            auth.getToken.mockResolvedValue('test-token');
            api.updateThreadStatus.mockRejectedValue(new Error('API error'));

            const ctrl = makeController();
            const thread = makeMockThread('active');

            (ctrl as any).threadMeta.set(thread, {
                org: 'org', project: 'proj', repoId: 'repo1',
                prId: 42, threadId: 7,
            });

            await ctrl.resolveThread(thread);

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                'Failed to resolve thread: API error'
            );
            // Thread state should remain unchanged
            expect(thread.contextValue).toBe('active');
        });
    });

    describe('unresolveThread', () => {
        it('does nothing when thread has no metadata', async () => {
            const ctrl = makeController();
            const thread = makeMockThread('resolved');

            await ctrl.unresolveThread(thread);

            expect(api.updateThreadStatus).not.toHaveBeenCalled();
        });

        it('shows error when no PAT configured', async () => {
            auth.getToken.mockResolvedValue(undefined);
            const ctrl = makeController();
            const thread = makeMockThread('resolved');

            (ctrl as any).threadMeta.set(thread, {
                org: 'org', project: 'proj', repoId: 'repo1',
                prId: 42, threadId: 7,
            });

            await ctrl.unresolveThread(thread);

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('No PAT configured.');
            expect(api.updateThreadStatus).not.toHaveBeenCalled();
        });

        it('reactivates a resolved thread and updates visual state', async () => {
            auth.getToken.mockResolvedValue('test-token');
            api.updateThreadStatus.mockResolvedValue(undefined);

            const ctrl = makeController();
            const thread = makeMockThread('resolved');

            (ctrl as any).threadMeta.set(thread, {
                org: 'org', project: 'proj', repoId: 'repo1',
                prId: 42, threadId: 7,
            });

            await ctrl.unresolveThread(thread);

            expect(api.updateThreadStatus).toHaveBeenCalledWith(
                'org', 'proj', 'repo1', 42, 7, 'active', 'test-token'
            );
            expect(thread.contextValue).toBe('active');
            expect(thread.state).toBe(vscode.CommentThreadState.Unresolved);
            expect(thread.label).toBe('Active');
            expect(thread.collapsibleState).toBe(vscode.CommentThreadCollapsibleState.Expanded);
        });

        it('shows error on API failure', async () => {
            auth.getToken.mockResolvedValue('test-token');
            api.updateThreadStatus.mockRejectedValue(new Error('Network error'));

            const ctrl = makeController();
            const thread = makeMockThread('resolved');

            (ctrl as any).threadMeta.set(thread, {
                org: 'org', project: 'proj', repoId: 'repo1',
                prId: 42, threadId: 7,
            });

            await ctrl.unresolveThread(thread);

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                'Failed to reactivate thread: Network error'
            );
            // Thread state should remain unchanged
            expect(thread.contextValue).toBe('resolved');
        });
    });
});
