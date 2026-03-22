import * as vscode from 'vscode';
import { PullRequestTreeProvider } from '../prSidebar';
import { EnrichedPullRequest, PrThreadSummary } from '../api';

function makeThread(threadId: number, latestCommentId: number, overrides: Partial<PrThreadSummary> = {}): PrThreadSummary {
    return {
        threadId,
        status: 'active',
        latestCommentId,
        ...overrides,
    };
}

function makePr(
    id: number,
    title: string,
    unresolvedCommentCount: number,
    commentThreads: PrThreadSummary[]
): EnrichedPullRequest {
    return {
        pullRequestId: id,
        title,
        sourceRefName: 'refs/heads/main',
        createdBy: { displayName: 'User', id: 'user1' },
        reviewers: [],
        repository: { id: 'repo1', name: 'repo', project: { id: 'proj1', name: 'proj' } },
        status: 'active',
        isDraft: false,
        url: '',
        unresolvedCommentCount,
        commentThreads,
        checksStatus: 'none',
        checks: [],
    };
}

describe('PullRequestTreeProvider.checkForNewComments', () => {
    let provider: PullRequestTreeProvider;
    let showInfoMock: jest.Mock;
    let openComment: jest.Mock;
    let openInDevOps: jest.Mock;

    beforeEach(() => {
        showInfoMock = vscode.window.showInformationMessage as jest.Mock;
        showInfoMock.mockReset();
        showInfoMock.mockResolvedValue(undefined);

        const getConfigMock = vscode.workspace.getConfiguration as jest.Mock;
        getConfigMock.mockReturnValue({
            get: jest.fn().mockImplementation((_key: string, defaultValue?: unknown) => defaultValue),
        });

        openComment = jest.fn().mockResolvedValue(undefined);
        openInDevOps = jest.fn().mockResolvedValue(undefined);

        provider = new PullRequestTreeProvider({} as any);
        provider.cachedOrg = 'org';
        provider.setCommentNotificationHandlers({ openComment, openInDevOps });
    });

    it('does not notify on first fetch (initialization)', async () => {
        const prs = [makePr(1, 'First PR', 1, [makeThread(10, 100)])];
        await provider.checkForNewComments(prs);

        expect(showInfoMock).not.toHaveBeenCalled();
    });

    it('notifies when a new thread appears', async () => {
        await provider.checkForNewComments([makePr(1, 'My PR', 1, [makeThread(10, 100)])]);
        await provider.checkForNewComments([makePr(1, 'My PR', 2, [makeThread(10, 100), makeThread(11, 101)])]);

        expect(showInfoMock).toHaveBeenCalledWith(
            'New comments on PR #1: My PR',
            'Open Comment',
            'Open in DevOps'
        );
    });

    it('notifies when a new reply appears on an existing thread', async () => {
        await provider.checkForNewComments([makePr(1, 'My PR', 1, [makeThread(10, 100)])]);
        await provider.checkForNewComments([makePr(1, 'My PR', 1, [makeThread(10, 101)])]);

        expect(showInfoMock).toHaveBeenCalledWith(
            'New comments on PR #1: My PR',
            'Open Comment',
            'Open in DevOps'
        );
    });

    it('shows a summary when multiple events are detected', async () => {
        await provider.checkForNewComments([
            makePr(1, 'PR A', 1, [makeThread(10, 100)]),
            makePr(2, 'PR B', 1, [makeThread(20, 200)]),
        ]);

        await provider.checkForNewComments([
            makePr(1, 'PR A', 1, [makeThread(10, 101)]),
            makePr(2, 'PR B', 2, [makeThread(20, 200), makeThread(21, 201)]),
        ]);

        expect(showInfoMock).toHaveBeenCalledWith('New comments on 2 discussion threads');
    });

    it('does not notify when thread snapshots stay the same', async () => {
        const prs = [makePr(1, 'No change', 1, [makeThread(10, 100)])];
        await provider.checkForNewComments(prs);
        await provider.checkForNewComments(prs);

        expect(showInfoMock).not.toHaveBeenCalled();
    });

    it('does not notify when comment threads disappear', async () => {
        await provider.checkForNewComments([makePr(1, 'Resolved', 1, [makeThread(10, 100)])]);
        await provider.checkForNewComments([makePr(1, 'Resolved', 0, [])]);

        expect(showInfoMock).not.toHaveBeenCalled();
    });

    it('does not notify when enableNotifications is false', async () => {
        const getConfigMock = vscode.workspace.getConfiguration as jest.Mock;
        getConfigMock.mockReturnValue({
            get: jest.fn().mockReturnValue(false),
        });

        await provider.checkForNewComments([makePr(1, 'My PR', 1, [makeThread(10, 100)])]);
        await provider.checkForNewComments([makePr(1, 'My PR', 1, [makeThread(10, 101)])]);

        expect(showInfoMock).not.toHaveBeenCalled();
    });

    it('invokes the open comment handler when selected', async () => {
        showInfoMock.mockResolvedValue('Open Comment');

        await provider.checkForNewComments([makePr(1, 'My PR', 1, [makeThread(10, 100)])]);
        await provider.checkForNewComments([makePr(1, 'My PR', 1, [makeThread(10, 101, { filePath: '/src/app.ts', line: 12 })])]);

        expect(openComment).toHaveBeenCalledTimes(1);
        expect(openComment.mock.calls[0][0].thread.threadId).toBe(10);
        expect(openInDevOps).not.toHaveBeenCalled();
    });

    it('invokes the open in DevOps handler when selected', async () => {
        showInfoMock.mockResolvedValue('Open in DevOps');

        await provider.checkForNewComments([makePr(1, 'My PR', 1, [makeThread(10, 100)])]);
        await provider.checkForNewComments([makePr(1, 'My PR', 1, [makeThread(10, 101)])]);

        expect(openInDevOps).toHaveBeenCalledTimes(1);
        expect(openInDevOps.mock.calls[0][0].pr.pullRequestId).toBe(1);
        expect(openComment).not.toHaveBeenCalled();
    });
});
