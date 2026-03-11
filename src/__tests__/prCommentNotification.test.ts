import * as vscode from 'vscode';
import { PullRequestTreeProvider } from '../prSidebar';
import { EnrichedPullRequest } from '../api';

function makePr(id: number, title: string, unresolvedCommentCount: number): EnrichedPullRequest {
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
        checksStatus: 'none',
    };
}

describe('PullRequestTreeProvider.checkForNewComments', () => {
    let provider: PullRequestTreeProvider;
    let showInfoMock: jest.Mock;

    beforeEach(() => {
        showInfoMock = vscode.window.showInformationMessage as jest.Mock;
        showInfoMock.mockClear();
        provider = new PullRequestTreeProvider({} as any);
    });

    it('does not notify on first fetch (initialization)', () => {
        const prs = [makePr(1, 'First PR', 3)];
        provider.checkForNewComments(prs);

        expect(showInfoMock).not.toHaveBeenCalled();
    });

    it('notifies when a single PR gets new comments', () => {
        const prs = [makePr(1, 'My PR', 2)];
        provider.checkForNewComments(prs);

        const updated = [makePr(1, 'My PR', 4)];
        provider.checkForNewComments(updated);

        expect(showInfoMock).toHaveBeenCalledTimes(1);
        expect(showInfoMock).toHaveBeenCalledWith('New comment on PR #1: My PR');
    });

    it('notifies with plural message when multiple PRs get new comments', () => {
        const prs = [makePr(1, 'PR A', 1), makePr(2, 'PR B', 0)];
        provider.checkForNewComments(prs);

        const updated = [makePr(1, 'PR A', 3), makePr(2, 'PR B', 2)];
        provider.checkForNewComments(updated);

        expect(showInfoMock).toHaveBeenCalledTimes(1);
        expect(showInfoMock).toHaveBeenCalledWith('New comments on 2 pull requests');
    });

    it('does not notify when comment counts stay the same', () => {
        const prs = [makePr(1, 'No change', 5)];
        provider.checkForNewComments(prs);
        provider.checkForNewComments(prs);

        expect(showInfoMock).not.toHaveBeenCalled();
    });

    it('does not notify when comment counts decrease', () => {
        const prs = [makePr(1, 'Resolved', 5)];
        provider.checkForNewComments(prs);

        const updated = [makePr(1, 'Resolved', 2)];
        provider.checkForNewComments(updated);

        expect(showInfoMock).not.toHaveBeenCalled();
    });

    it('notifies for a newly appeared PR with comments', () => {
        const prs = [makePr(1, 'Existing', 0)];
        provider.checkForNewComments(prs);

        const updated = [makePr(1, 'Existing', 0), makePr(2, 'New PR', 3)];
        provider.checkForNewComments(updated);

        expect(showInfoMock).toHaveBeenCalledTimes(1);
        expect(showInfoMock).toHaveBeenCalledWith('New comment on PR #2: New PR');
    });

    it('does not notify for a newly appeared PR with zero comments', () => {
        const prs = [makePr(1, 'Existing', 0)];
        provider.checkForNewComments(prs);

        const updated = [makePr(1, 'Existing', 0), makePr(2, 'New PR', 0)];
        provider.checkForNewComments(updated);

        expect(showInfoMock).not.toHaveBeenCalled();
    });

    it('only notifies for PRs that actually have increased counts', () => {
        const prs = [makePr(1, 'PR A', 3), makePr(2, 'PR B', 5)];
        provider.checkForNewComments(prs);

        // Only PR A gets new comments, PR B stays the same
        const updated = [makePr(1, 'PR A', 6), makePr(2, 'PR B', 5)];
        provider.checkForNewComments(updated);

        expect(showInfoMock).toHaveBeenCalledTimes(1);
        expect(showInfoMock).toHaveBeenCalledWith('New comment on PR #1: PR A');
    });

    it('handles empty PR list without errors', () => {
        provider.checkForNewComments([]);
        provider.checkForNewComments([]);

        expect(showInfoMock).not.toHaveBeenCalled();
    });
});
